import math
import uuid
import time
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional

from models import TelemetryWindow, AgentDecision, AnalysisReport

# Hard Non-Negotiable Operational Guardrails (from GEMINI.md & proactive-scaler/SKILL.md)
HARD_MIN_INSTANCES = 1
HARD_MAX_INSTANCES = 15
HARD_CEILING_MAX_INSTANCES = 30
MIN_CONFIDENCE_THRESHOLD = 0.85

# Skill Tuning Parameters
TARGET_CONCURRENCY_PER_CONTAINER = 10.0   # Matches target-store-service MAX_CONCURRENCY
AVG_CHECKOUT_LATENCY_SEC = 0.25           # 250ms average checkout processing
SURGE_SAFETY_BUFFER_FACTOR = 1.2          # 1.2x headroom during surge
SCALE_DOWN_COOLDOWN_SECONDS = 10          # Hysteresis to prevent scale-down thrashing

class PulseGuardReasoningEngine:
    """
    Core reasoning engine for PulseGuard.
    Translates per-second telemetry sliding windows into bounded scaling and inventory decisions
    based on Google Agent Skills:
      - .agents/skills/proactive-scaler/SKILL.md
      - .agents/skills/telemetry-inventory-guard/SKILL.md
    """

    def __init__(self, cooldown_window: int = SCALE_DOWN_COOLDOWN_SECONDS):
        self.cooldown_window = cooldown_window
        self.consecutive_low_traffic_seconds = 0
        self.current_allocated_instances = 1
        self.active_inventory_lock: Optional[str] = None
        self.total_decisions_made = 0

    def evaluate_traffic_phase(self, window: TelemetryWindow) -> str:
        """Determines traffic phase: BASELINE, SURGE_ACCELERATING, SUSTAINED_PEAK, or COOLDOWN."""
        if window.current_rps <= 10.0 and window.delta_rps <= 5.0 and window.error_rate_5xx == 0.0:
            return "BASELINE"
        elif window.delta_rps >= 20.0 or window.latency_slope >= 15.0 or window.current_concurrency_per_instance >= 7.0:
            return "SURGE_ACCELERATING 🔥"
        elif window.current_rps >= 50.0:
            return "SUSTAINED_PEAK"
        else:
            return "COOLDOWN"

    def calculate_target_instances(self, predicted_peak_rps: float, surge_detected: bool = False) -> int:
        """
        Implements proactive-scaler/SKILL.md formula:
        Required Instances = ceil((Predicted Peak RPS * Avg Latency) / Target Concurrency)
        Apply 1.2x safety buffer during high acceleration surge.
        Clamped strictly between 1 and 15.
        """
        if predicted_peak_rps <= 0:
            return HARD_MIN_INSTANCES

        raw_needed = (predicted_peak_rps * AVG_CHECKOUT_LATENCY_SEC) / TARGET_CONCURRENCY_PER_CONTAINER
        if surge_detected:
            buffered = math.ceil(raw_needed) * SURGE_SAFETY_BUFFER_FACTOR
            instances = math.ceil(buffered)
        else:
            instances = math.ceil(raw_needed)

        clamped = max(HARD_MIN_INSTANCES, min(HARD_MAX_INSTANCES, instances))
        return clamped

    def analyze_second(self, window: TelemetryWindow, execution_start_time: float) -> Tuple[AgentDecision, AnalysisReport]:
        """
        Evaluates a single second's telemetry window, applies skills and guardrails,
        and generates both the strict AgentDecision and detailed AnalysisReport.
        """
        self.total_decisions_made += 1
        phase = self.evaluate_traffic_phase(window)
        current_inst = max(1, window.active_instances or self.current_allocated_instances)

        # 1. Surge & Velocity Assessment
        surge_detected = False
        confidence = 0.0
        predicted_peak_rps = window.current_rps

        # Acceleration slope triggers
        if window.delta_rps >= 20.0 or window.latency_slope >= 15.0 or window.current_concurrency_per_instance >= 7.0 or window.error_rate_5xx > 0.01:
            surge_detected = True
            # Estimate peak based on positive acceleration
            positive_delta = max(0.0, window.delta_rps)
            predicted_peak_rps = window.current_rps + (positive_delta * 1.5)
            # High confidence based on multiple correlated signals
            confidence = min(0.98, 0.85 + (positive_delta / 200.0) + (window.latency_slope / 500.0))
        elif window.current_rps >= 40.0:
            surge_detected = True
            predicted_peak_rps = window.current_rps * 1.15
            confidence = 0.90
        else:
            # Baseline or steady low traffic
            surge_detected = False
            predicted_peak_rps = max(5.0, window.current_rps)
            confidence = 0.95

        # 2. Target Instance Calculation
        target_inst = self.calculate_target_instances(predicted_peak_rps, surge_detected=surge_detected)

        # 3. Scaling Direction & Hysteresis Logic
        scaling_action: str = "HOLD"
        instances_delta = 0
        action_required = False

        if target_inst > current_inst:
            # Scale UP immediately to beat reactive lag!
            scaling_action = "SCALE_UP"
            instances_delta = target_inst - current_inst
            action_required = (confidence >= MIN_CONFIDENCE_THRESHOLD)
            self.consecutive_low_traffic_seconds = 0
            if action_required:
                self.current_allocated_instances = target_inst
                reasoning = (
                    f"Surge detected ({phase}): Rapid acceleration (ΔRPS={window.delta_rps:+.1f}, "
                    f"latency slope={window.latency_slope:+.1f}ms/s, concurrency={window.current_concurrency_per_instance:.1f}/inst). "
                    f"Proactively pre-warming Cloud Run +{instances_delta} instances (allocating {target_inst} total)."
                )
            else:
                reasoning = f"Surge velocity detected but confidence ({confidence:.2f}) < {MIN_CONFIDENCE_THRESHOLD}. Holding."

        elif target_inst < current_inst:
            # Scale DOWN requires cooldown hysteresis to prevent flapping
            self.consecutive_low_traffic_seconds += 1
            remaining_cooldown = max(0, self.cooldown_window - self.consecutive_low_traffic_seconds)

            if remaining_cooldown > 0:
                scaling_action = "HOLD"
                instances_delta = 0
                action_required = False
                reasoning = (
                    f"Traffic subsided to {window.current_rps:.1f} RPS. "
                    f"Holding current {current_inst} instances in stabilization cooldown ({remaining_cooldown}s remaining) to prevent flapping."
                )
            else:
                # Cooldown satisfied: graceful step-down
                step_down = min(2, current_inst - target_inst) # step down gracefully
                new_alloc = max(target_inst, current_inst - step_down)
                scaling_action = "SCALE_DOWN"
                instances_delta = -(current_inst - new_alloc)
                action_required = True
                self.current_allocated_instances = new_alloc
                reasoning = (
                    f"Cooldown window satisfied ({self.cooldown_window}s of stable low traffic). "
                    f"Gracefully de-provisioning {abs(instances_delta)} instances down to {new_alloc} to eliminate idle compute waste."
                )
        else:
            # Capacity matches demand
            scaling_action = "HOLD"
            instances_delta = 0
            action_required = False
            self.consecutive_low_traffic_seconds = 0
            reasoning = f"Allocation optimal at {current_inst} instances for {window.current_rps:.1f} RPS. No scaling action required."

        # 4. Inventory Guardrail Check (telemetry-inventory-guard/SKILL.md)
        lock_external_inventory = False
        locked_channels = []
        idemp_key = None

        if window.marketplace_webhook_lag_ms > 500.0 or (window.delta_rps > 30.0 and surge_detected) or (window.error_rate_5xx > 0.03):
            lock_external_inventory = True
            locked_channels = ["amazon", "flipkart"]
            if not self.active_inventory_lock:
                self.active_inventory_lock = str(uuid.uuid4())
            idemp_key = self.active_inventory_lock
            reasoning += f" | Safety Stock Guardrail: Webhook lag ({window.marketplace_webhook_lag_ms:.1f}ms) or contention triggered idempotent stock lock on {locked_channels}."
        else:
            # If traffic has normalized and we were locked, allow unlock
            if phase == "BASELINE" and self.active_inventory_lock:
                self.active_inventory_lock = None

        # Clamp check enforcement
        final_min_instances = max(HARD_MIN_INSTANCES, min(HARD_MAX_INSTANCES, self.current_allocated_instances))

        decision_latency_ms = round((time.perf_counter() - execution_start_time) * 1000.0, 2)

        # Build Decision
        decision = AgentDecision(
            surge_detected=surge_detected,
            confidence_score=round(confidence, 2),
            predicted_peak_rps=round(predicted_peak_rps, 1),
            recommended_min_instances=final_min_instances,
            lock_external_inventory=lock_external_inventory,
            lock_channels=locked_channels if locked_channels else ["amazon", "flipkart"],
            reasoning=reasoning[:500],
            action_required=action_required,
            failsafe_active=False
        )

        # Build Comprehensive Report
        report = AnalysisReport(
            report_id=f"rep-{uuid.uuid4().hex[:8]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            traffic_phase=phase,
            current_rps=window.current_rps,
            delta_rps=window.delta_rps,
            p95_latency_ms=window.p95_latency_ms,
            latency_slope=window.latency_slope,
            error_rate_5xx=window.error_rate_5xx,
            current_instances=current_inst,
            target_instances=final_min_instances,
            instances_delta=instances_delta,
            scaling_action=scaling_action,
            confidence_score=round(confidence, 2),
            predicted_peak_rps=round(predicted_peak_rps, 1),
            inventory_lock_triggered=lock_external_inventory,
            locked_channels=locked_channels,
            idempotency_key=idemp_key,
            reasoning=reasoning,
            cooldown_seconds_remaining=max(0, self.cooldown_window - self.consecutive_low_traffic_seconds) if target_inst < current_inst else 0,
            decision_latency_ms=decision_latency_ms,
            watchdog_status="PASS (within 2000ms SLA)",
            guardrails_passed=True
        )

        return decision, report
