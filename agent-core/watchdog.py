import time
import asyncio
from typing import Callable, Any, Tuple, Optional
from datetime import datetime, timezone

from models import AgentDecision, AnalysisReport

HARD_WATCHDOG_TIMEOUT_SEC = 2.0  # 2000ms SLA (Non-negotiable circuit breaker)

class FailSafeWatchdog:
    """
    Enforces a strict 2000ms timeout circuit breaker around the agent decision cycle.
    If the reasoning engine or cloud API call takes longer than 2000ms or crashes,
    it trips the circuit breaker and safely reverts to:
      status: FAILSAFE_ENGAGED: Native Autoscaler Active
    """

    def __init__(self, timeout_sec: float = HARD_WATCHDOG_TIMEOUT_SEC):
        self.timeout_sec = timeout_sec

    def execute_with_guardrail(
        self,
        decision_fn: Any,
        fallback_current_instances: int = 1
    ) -> Tuple[AgentDecision, AnalysisReport]:
        start = time.perf_counter()

        try:
            decision, report = decision_fn()

            elapsed_ms = round((time.perf_counter() - start) * 1000.0, 2)
            if elapsed_ms > (self.timeout_sec * 1000.0):
                raise TimeoutError(f"Elapsed {elapsed_ms}ms exceeds SLA")

            report.decision_latency_ms = elapsed_ms
            report.watchdog_status = f"PASS ({elapsed_ms}ms <= {int(self.timeout_sec*1000)}ms SLA)"
            return decision, report

        except asyncio.TimeoutError:
            elapsed_ms = round((time.perf_counter() - start) * 1000.0, 2)
            # Circuit breaker TRIPPED!
            failsafe_decision = AgentDecision(
                surge_detected=False,
                confidence_score=0.0,
                predicted_peak_rps=0.0,
                recommended_min_instances=fallback_current_instances,
                lock_external_inventory=False,
                lock_channels=[],
                reasoning=f"FAILSAFE ENGAGED: Decision took {elapsed_ms}ms, breaching {int(self.timeout_sec*1000)}ms SLA. Reverting control to native autoscaler.",
                action_required=False,
                failsafe_active=True
            )

            failsafe_report = AnalysisReport(
                report_id=f"failsafe-{int(time.time())}",
                timestamp=datetime.now(timezone.utc).isoformat(),
                traffic_phase="FAILSAFE_ACTIVE",
                current_rps=0.0,
                delta_rps=0.0,
                p95_latency_ms=0.0,
                latency_slope=0.0,
                error_rate_5xx=0.0,
                current_instances=fallback_current_instances,
                target_instances=fallback_current_instances,
                instances_delta=0,
                scaling_action="HOLD",
                confidence_score=0.0,
                predicted_peak_rps=0.0,
                inventory_lock_triggered=False,
                locked_channels=[],
                idempotency_key=None,
                reasoning=f"WATCHDOG CIRCUIT BREAKER TRIPPED! Decision time {elapsed_ms}ms exceeded 2000ms. Native reactive autoscaler engaged.",
                cooldown_seconds_remaining=0,
                decision_latency_ms=elapsed_ms,
                watchdog_status="FAILSAFE_ENGAGED: Native Autoscaler Active",
                guardrails_passed=True
            )

            return failsafe_decision, failsafe_report

        except Exception as ex:
            elapsed_ms = round((time.perf_counter() - start) * 1000.0, 2)
            failsafe_decision = AgentDecision(
                surge_detected=False,
                confidence_score=0.0,
                predicted_peak_rps=0.0,
                recommended_min_instances=fallback_current_instances,
                lock_external_inventory=False,
                lock_channels=[],
                reasoning=f"FAILSAFE ENGAGED: Unexpected error ({str(ex)}). Control reverted to native autoscaler.",
                action_required=False,
                failsafe_active=True
            )

            failsafe_report = AnalysisReport(
                report_id=f"error-{int(time.time())}",
                timestamp=datetime.now(timezone.utc).isoformat(),
                traffic_phase="ERROR_FAILSAFE",
                current_rps=0.0,
                delta_rps=0.0,
                p95_latency_ms=0.0,
                latency_slope=0.0,
                error_rate_5xx=0.0,
                current_instances=fallback_current_instances,
                target_instances=fallback_current_instances,
                instances_delta=0,
                scaling_action="HOLD",
                confidence_score=0.0,
                predicted_peak_rps=0.0,
                inventory_lock_triggered=False,
                locked_channels=[],
                idempotency_key=None,
                reasoning=f"Error in decision loop: {str(ex)}. Control reverted to native autoscaler.",
                cooldown_seconds_remaining=0,
                decision_latency_ms=elapsed_ms,
                watchdog_status="FAILSAFE_ENGAGED: Native Autoscaler Active",
                guardrails_passed=True
            )

            return failsafe_decision, failsafe_report
