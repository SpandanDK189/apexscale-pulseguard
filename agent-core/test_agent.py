import time
import asyncio
from datetime import datetime, timezone

from models import TelemetryWindow, AgentDecision, AnalysisReport
from reasoning_engine import (
    PulseGuardReasoningEngine,
    HARD_MIN_INSTANCES,
    HARD_MAX_INSTANCES,
    MIN_CONFIDENCE_THRESHOLD
)
from watchdog import FailSafeWatchdog

def test_baseline_traffic_hold():
    """Verify that baseline traffic (5 RPS) maintains 1 instance with no scaling action."""
    engine = PulseGuardReasoningEngine()
    window = TelemetryWindow(
        timestamp=datetime.now(timezone.utc).isoformat(),
        current_rps=5.0,
        delta_rps=0.0,
        p50_latency_ms=120.0,
        p95_latency_ms=140.0,
        latency_slope=0.0,
        error_rate_5xx=0.0,
        active_instances=1,
        current_concurrency_per_instance=1.2,
        marketplace_webhook_lag_ms=120.0
    )

    decision, report = engine.analyze_second(window, time.perf_counter())
    assert decision.surge_detected is False
    assert decision.action_required is False
    assert decision.recommended_min_instances == 1
    assert report.scaling_action == "HOLD"
    assert report.instances_delta == 0
    print("✅ test_baseline_traffic_hold passed")

def test_flash_sale_surge_scale_up():
    """Verify that a sudden spike acceleration triggers SCALE_UP to pre-warm instances."""
    engine = PulseGuardReasoningEngine()
    window = TelemetryWindow(
        timestamp=datetime.now(timezone.utc).isoformat(),
        current_rps=45.0,
        delta_rps=55.0,          # High positive acceleration!
        p50_latency_ms=350.0,
        p95_latency_ms=480.0,
        latency_slope=35.0,      # Latency slope steepening!
        error_rate_5xx=0.02,
        active_instances=1,      # Still only 1 container running (traditional would crash)
        current_concurrency_per_instance=8.5, # Saturated!
        marketplace_webhook_lag_ms=650.0      # Webhook lag detected!
    )

    decision, report = engine.analyze_second(window, time.perf_counter())
    assert decision.surge_detected is True
    assert decision.confidence_score >= MIN_CONFIDENCE_THRESHOLD
    assert decision.action_required is True
    assert decision.recommended_min_instances >= 4
    assert decision.recommended_min_instances <= HARD_MAX_INSTANCES
    assert report.scaling_action == "SCALE_UP"
    assert report.instances_delta > 0
    assert decision.lock_external_inventory is True
    assert "amazon" in decision.lock_channels
    assert "flipkart" in decision.lock_channels
    assert report.idempotency_key is not None
    print(f"✅ test_flash_sale_surge_scale_up passed: Scaled up to {decision.recommended_min_instances} instances (delta: +{report.instances_delta})")

def test_hard_instance_bounds_clamping():
    """Verify that extreme traffic cannot breach the hard max of 15 instances."""
    engine = PulseGuardReasoningEngine()
    extreme_window = TelemetryWindow(
        timestamp=datetime.now(timezone.utc).isoformat(),
        current_rps=2000.0,      # Massive traffic spike
        delta_rps=800.0,
        p50_latency_ms=800.0,
        p95_latency_ms=2500.0,
        latency_slope=120.0,
        error_rate_5xx=0.25,
        active_instances=2,
        current_concurrency_per_instance=25.0,
        marketplace_webhook_lag_ms=1200.0
    )

    decision, report = engine.analyze_second(extreme_window, time.perf_counter())
    assert decision.recommended_min_instances == HARD_MAX_INSTANCES  # Must clamp strictly to 15!
    assert decision.recommended_min_instances <= 15
    assert decision.recommended_min_instances >= 1
    print(f"✅ test_hard_instance_bounds_clamping passed: Clamped strictly to {decision.recommended_min_instances}")

def test_cooldown_hysteresis_prevents_flapping():
    """Verify that scale-down is held during the cooldown window to avoid thrashing."""
    engine = PulseGuardReasoningEngine(cooldown_window=3)
    # Simulate being scaled up to 8 instances
    engine.current_allocated_instances = 8

    # Traffic suddenly drops to 5 RPS
    window = TelemetryWindow(
        timestamp=datetime.now(timezone.utc).isoformat(),
        current_rps=5.0,
        delta_rps=-80.0,
        p50_latency_ms=120.0,
        p95_latency_ms=140.0,
        latency_slope=-20.0,
        error_rate_5xx=0.0,
        active_instances=8,
        current_concurrency_per_instance=0.2,
        marketplace_webhook_lag_ms=110.0
    )

    # Tick 1: Should HOLD in cooldown
    _, r1 = engine.analyze_second(window, time.perf_counter())
    assert r1.scaling_action == "HOLD"
    assert r1.cooldown_seconds_remaining == 2

    # Tick 2: Should HOLD in cooldown
    _, r2 = engine.analyze_second(window, time.perf_counter())
    assert r2.scaling_action == "HOLD"
    assert r2.cooldown_seconds_remaining == 1

    # Tick 3: Cooldown expires -> Graceful SCALE_DOWN
    _, r3 = engine.analyze_second(window, time.perf_counter())
    assert r3.scaling_action == "SCALE_DOWN"
    assert r3.instances_delta < 0
    print("✅ test_cooldown_hysteresis_prevents_flapping passed")

def test_watchdog_circuit_breaker():
    """Verify that a lagging decision (> 2000ms) trips the circuit breaker to native autoscaler."""
    watchdog = FailSafeWatchdog(timeout_sec=0.05) # Fast test timeout of 50ms

    def lagging_fn():
        time.sleep(0.1) # Simulate 100ms lag exceeding 50ms SLA
        return None, None

    decision, report = watchdog.execute_with_guardrail(lagging_fn, fallback_current_instances=2)
    assert decision.failsafe_active is True
    assert "FAILSAFE_ENGAGED" in report.watchdog_status
    assert report.scaling_action == "HOLD"
    assert report.current_instances == 2
    print("✅ test_watchdog_circuit_breaker passed: Circuit breaker tripped to native autoscaler")

def main():
    print("=" * 60)
    print("🧪 Running PulseGuard Agent Test Suite")
    print("=" * 60)
    test_baseline_traffic_hold()
    test_flash_sale_surge_scale_up()
    test_hard_instance_bounds_clamping()
    test_cooldown_hysteresis_prevents_flapping()
    test_watchdog_circuit_breaker()
    print("=" * 60)
    print("🎉 All 5 Agent Unit Tests Passed Successfully!")
    print("=" * 60)

if __name__ == "__main__":
    main()
