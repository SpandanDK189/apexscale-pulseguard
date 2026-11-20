from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class EndpointMetric(BaseModel):
    endpoint: str
    rps: float
    p95_ms: float

class TelemetryWindow(BaseModel):
    """Telemetry Sliding Window Payload conforming strictly to GEMINI.md Section 4.1"""
    timestamp: str
    window_seconds: int = 15
    current_rps: float
    delta_rps: float
    p50_latency_ms: float
    p95_latency_ms: float
    latency_slope: float
    error_rate_5xx: float
    active_instances: int = 1
    current_concurrency_per_instance: float = 0.0
    monitored_endpoints: List[EndpointMetric] = Field(default_factory=list)
    marketplace_webhook_lag_ms: float = 0.0

class AgentDecision(BaseModel):
    """Strict Decision Output Schema conforming to GEMINI.md Section 4.2"""
    surge_detected: bool
    confidence_score: float = Field(ge=0.0, le=1.0)
    predicted_peak_rps: float = Field(ge=0.0)
    recommended_min_instances: int = Field(ge=1, le=15)
    lock_external_inventory: bool
    lock_channels: List[Literal["amazon", "flipkart", "myntra", "ondc", "all"]] = Field(
        default_factory=lambda: ["amazon", "flipkart"]
    )
    reasoning: str = Field(max_length=500)
    action_required: bool
    failsafe_active: bool = False

class AnalysisReport(BaseModel):
    """Comprehensive per-second analysis report produced by the PulseGuard agent."""
    report_id: str
    timestamp: str
    traffic_phase: str
    current_rps: float
    delta_rps: float
    p95_latency_ms: float
    latency_slope: float
    error_rate_5xx: float
    current_instances: int
    target_instances: int
    instances_delta: int
    scaling_action: Literal["SCALE_UP", "SCALE_DOWN", "HOLD"]
    confidence_score: float
    predicted_peak_rps: float
    inventory_lock_triggered: bool
    locked_channels: List[str]
    idempotency_key: Optional[str] = None
    reasoning: str
    cooldown_seconds_remaining: int = 0
    decision_latency_ms: float
    watchdog_status: str
    guardrails_passed: bool
