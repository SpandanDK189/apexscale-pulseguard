# PulseGuard — Telemetry Interceptor & Watchdog Integration Guide

Owned by: **Spandan** (Backend, Telemetry & Cloud Runtime)

This service provides ultra-low latency API telemetry interception, an in-memory sliding window calculating real-time traffic slopes ($\Delta\text{RPS}$, $\text{P95}$ latency acceleration), asynchronous streaming to BigQuery, and deterministic Cloud Run scaling with a 2000ms fail-safe watchdog circuit breaker.

---

## 1. Quick Start (Running the Go Interceptor)

```bash
cd telemetry-interceptor
go run main.go
```
* Default Port: `8080` (Override via `PORT` environment variable)
* Sliding Window Duration: `15s` (Override via `WINDOW_SECONDS` environment variable)
* Health Check: `GET http://localhost:8080/healthz`

---

## 2. Guide for Santosh (`target-store-service` & `load-simulator`)

### How to Forward Request Telemetry (`POST /telemetry/record`)
From your checkout service middleware or request handler, dispatch an asynchronous non-blocking POST request after each request completes:

- **Endpoint:** `POST http://localhost:8080/telemetry/record`
- **Headers:** `Content-Type: application/json`
- **Request Body Schema:**
```json
{
  "endpoint": "/api/checkout",
  "http_method": "POST",
  "status_code": 200,
  "latency_ms": 142.5,
  "queue_depth": 3,
  "active_instances": 1,
  "channel": "amazon"
}
```

*Note: `event_id` and `timestamp` will be automatically assigned if omitted.*

### How to Update Marketplace Webhook Lag (`POST /telemetry/webhook-lag`)
When webhook response times from external channels (Amazon/Flipkart) fluctuate:

- **Endpoint:** `POST http://localhost:8080/telemetry/webhook-lag`
- **Request Body:**
```json
{
  "lag_ms": 680.0
}
```

---

## 3. Guide for Mayur (`agent-core` & Gemini Loop)

### How to Query Real-Time Telemetry Window (`GET /telemetry/window`)
Your Gemini prompt/agent should poll or query this endpoint to evaluate the current sliding-window slope:

- **Endpoint:** `GET http://localhost:8080/telemetry/window`
- **Response Format (Strict GEMINI.md Section 4.1 Schema):**
```json
{
  "timestamp": "2026-11-20T11:30:00Z",
  "window_seconds": 15,
  "current_rps": 45.0,
  "delta_rps": 80.7,
  "p50_latency_ms": 584.0,
  "p95_latency_ms": 775.4,
  "latency_slope": 85.66,
  "error_rate_5xx": 0.035,
  "active_instances": 2,
  "current_concurrency_per_instance": 13.1,
  "monitored_endpoints": [
    {
      "endpoint": "/api/checkout",
      "rps": 38.5,
      "p95_ms": 780.0
    },
    {
      "endpoint": "/api/products",
      "rps": 6.5,
      "p95_ms": 120.0
    }
  ],
  "marketplace_webhook_lag_ms": 680.0
}
```

---

## 4. Scaler & 2000ms Watchdog Circuit Breaker (`agent-core/scaler`)

The execution package in `agent-core/scaler/` guarantees that:
1. `min_instances` is clamped strictly between **`1` and `15`**.
2. Actions are only executed when `confidence_score >= 0.85`.
3. If an agent call or Gemini API request takes longer than **`2000ms`**, the watchdog immediately trips and reverts to native autoscaling:
   `status: FAILSAFE_ENGAGED: Native Autoscaler Active`.

### Running Scaler Tests:
```bash
cd agent-core
go test -v ./...
```
