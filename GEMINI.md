# PulseGuard (Team ApexScale) — Antigravity Workspace Context & Directives

This document provides system-level instructions, team conventions, schema definitions, and guardrails for Google Antigravity Agent Manager and all participating agents working on **PulseGuard**.

---

## 1. Project Overview & Identity
- **Product Name:** PulseGuard (Autonomous Multi-Cloud Resilience & Marketplace API Inventory Guardrail Agent)
- **Team Name:** ApexScale
- **Event:** Google DeepMind & Google Cloud Startup Buildathon India 2026 (Hard Cutoff: Day 2, 9:00 AM IST)
- **Vertical:** Cloudtech and DevOps | Open Innovation
- **Core Mission:** Eliminate reactive autoscaling latency (2-5 min lag) and multi-channel inventory desync during flash-sale spikes by correlating real-time API telemetry slopes with Gemini Omni / Gemini API to proactively scale Google Cloud Run instances and lock marketplace safety stock.

---

## 2. Team Ownership & Responsibilities
- **Spandan:** Backend, Telemetry & Cloud Runtime (`telemetry-interceptor/`, GCP APIs, Cloud Run Admin API scaler, 2000ms circuit-breaker fail-safe).
- **Santosh:** Backend, Load Sim & Demo UI (`target-store-service/`, `load-simulator/`, `demo-dashboard/`).
- **Mayur:** Agentic Core, Skills & MCP (`agent-core/`, `.agents/skills/*/SKILL.md`, Gemini prompt/schema design).

---

## 3. Strict Deterministic Guardrails (Non-Negotiable)

Any agent, script, or tool operating in this repo must adhere to these hard constraints:

1. **Instance Limits:**
   - `min_instances` for Cloud Run must ALWAYS be clamped: **`1 <= min_instances <= 15`**.
   - `max_instances` must NEVER exceed **`30`**.
   - No autonomous action may set `min_instances` to `0` during active monitoring windows.
2. **Confidence Threshold:**
   - Proactive scaling actions REQUIRE an agent confidence score **`confidence_score >= 0.85`**.
   - If confidence is `< 0.85`, do NOT scale. Log reasoning and maintain current allocation.
3. **Fail-Safe Watchdog (Circuit Breaker):**
   - Agent execution or Gemini API calls have a **hard timeout of 2000ms (2 seconds)**.
   - If a call exceeds 2000ms or throws an unhandled exception, the system MUST fallback immediately:
     `status: FAILSAFE_ENGAGED: Native Autoscaler Active`.
   - Native threshold-based autoscaling takes over unconditionally.
4. **Inventory Lock Idempotency:**
   - All inventory lock requests to `POST /mock-marketplace/lock-stock` or marketplace webhooks must be idempotent using an `idempotency_key` (UUIDv4) and specify `sku`, `locked_quantity`, and `channel`.

---

## 4. Shared Contract Specifications

### 4.1 Telemetry Sliding Window Payload (Output of `telemetry-interceptor/`)
Sent from telemetry layer to `agent-core`:
```json
{
  "timestamp": "2026-11-20T11:30:00.000Z",
  "window_seconds": 15,
  "current_rps": 124.5,
  "delta_rps": 48.2,
  "p50_latency_ms": 145.0,
  "p95_latency_ms": 480.0,
  "latency_slope": 18.5,
  "error_rate_5xx": 0.04,
  "active_instances": 2,
  "current_concurrency_per_instance": 8.5,
  "monitored_endpoints": [
    {"endpoint": "/api/checkout", "rps": 85.0, "p95_ms": 520.0},
    {"endpoint": "/api/products", "rps": 39.5, "p95_ms": 110.0}
  ],
  "marketplace_webhook_lag_ms": 780.0
}
```

### 4.2 Agent Decision Output Schema (Strict JSON from `agent-core/`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "surge_detected": { "type": "boolean" },
    "confidence_score": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
    "predicted_peak_rps": { "type": "number", "minimum": 0.0 },
    "recommended_min_instances": { "type": "integer", "minimum": 1, "maximum": 15 },
    "lock_external_inventory": { "type": "boolean" },
    "lock_channels": {
      "type": "array",
      "items": { "type": "string", "enum": ["amazon", "flipkart", "myntra", "ondc", "all"] }
    },
    "reasoning": { "type": "string", "maxLength": 500 },
    "action_required": { "type": "boolean" },
    "failsafe_active": { "type": "boolean" }
  },
  "required": [
    "surge_detected",
    "confidence_score",
    "predicted_peak_rps",
    "recommended_min_instances",
    "lock_external_inventory",
    "reasoning",
    "action_required"
  ],
  "additionalProperties": false
}
```

---

## 5. Technology Stack & Integration Details
- **Reasoning Core:** Google Gemini Omni & Gemini API (Structured JSON Mode & Function Calling).
- **Proactive Scaling Target:** Google Cloud Run (via Cloud Run Admin API v2 `projects.locations.services.patch`).
- **Data & Telemetry:** BigQuery streaming ingestion + in-memory sliding window queue.
- **Agent Skill Standard:** Google Agent Skills (`.agents/skills/*/SKILL.md`) using progressive disclosure.
- **Development Environment:** Standalone Google Antigravity IDE, Google AI Studio, Vertex AI.
