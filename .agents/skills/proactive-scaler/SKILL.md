---
name: proactive-scaler
description: Evaluates real-time API telemetry slopes and executes bounded proactive Cloud Run scaling ahead of flash-sale traffic surges with hard deterministic guardrails and a 2000ms fail-safe fallback.
---

# Proactive Scaler Skill (`proactive-scaler`)

## Purpose
This skill translates real-time telemetry metrics (rate of change $\Delta\text{RPS}$, P95 latency slope, current concurrency) into deterministic, bounded scaling directives for Google Cloud Run instances to prevent the 2-5 minute reactive autoscaling lag.

---

## Hard Operational Guardrails

1. **Instance Bounds:**
   - `min_instances` MUST be an integer between **`1` and `15`**.
   - Under NO circumstance may `min_instances` be set to `0` or greater than `15`.
   - `max_instances` ceiling is clamped to **`30`**.
2. **Confidence Gate:**
   - A scaling action requires `confidence_score >= 0.85`.
   - If `confidence_score < 0.85`, maintain the current instance allocation and set `action_required: false`.
3. **Execution Timeout (Circuit Breaker):**
   - The entire agent decision cycle must complete within **`2000ms`**.
   - If processing exceeds `2000ms`, the caller must abort and engage native autoscaler mode:
     `status: FAILSAFE_ENGAGED: Native Autoscaler Active`.

---

## Scaling Formula Guidelines

When calculating `recommended_min_instances` from predicted traffic:
$$\text{Required Instances} = \left\lceil \frac{\text{Predicted Peak RPS} \times \text{Average Latency (seconds)}}{\text{Target Concurrency Per Instance}} \right\rceil$$

- Default Target Concurrency per container: **`10` requests**.
- Default Average Checkout Latency: **`0.25` seconds (250ms)**.
- Apply a safety buffer factor of **`1.2x`** during high $\Delta\text{RPS}$ acceleration.
- Clamp output: $\max(1, \min(15, \text{Calculated Instances}))$.

---

## Input Schema (Telemetry Summary)

```json
{
  "timestamp": "ISO-8601 string",
  "window_seconds": 15,
  "current_rps": 120.0,
  "delta_rps": 45.0,
  "p50_latency_ms": 130.0,
  "p95_latency_ms": 420.0,
  "latency_slope": 15.0,
  "error_rate_5xx": 0.02,
  "active_instances": 2,
  "current_concurrency_per_instance": 8.0
}
```

---

## Expected Structured Output Schema

```json
{
  "surge_detected": true,
  "confidence_score": 0.92,
  "predicted_peak_rps": 180.0,
  "recommended_min_instances": 6,
  "action_required": true,
  "reasoning": "Rapid RPS acceleration (delta_rps = +45 over 15s) and P95 latency slope reaching 420ms indicate flash-sale surge. Bumping min_instances to 6 to absorb peak."
}
```

---

## Target Cloud Run Mutation Spec
- **Target API:** Google Cloud Run Admin API v2
- **Method:** `PATCH https://run.googleapis.com/v2/projects/{project}/locations/{region}/services/{service}`
- **Field Updated:** `template.scaling.minInstanceCount`
- **Fallback on API Error:** Log `FAILSAFE_ENGAGED` and yield to Cloud Run's native autoscaler.
