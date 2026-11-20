---
name: telemetry-inventory-guard
description: Evaluates API gateway telemetry velocity and marketplace webhook latency, streaming events to BigQuery and triggering idempotent multi-channel inventory locks during high-concurrency contention to prevent overselling.
---

# Telemetry & Inventory Guard Skill (`telemetry-inventory-guard`)

## Purpose
This skill monitors streaming API gateway metrics and marketplace webhook lag to detect multi-channel inventory desynchronization risks. When a flash sale creates race-condition contention on limited stock, this skill triggers idempotent stock locks across external channels (Amazon, Flipkart, Myntra, ONDC).

---

## Operational Guardrails

1. **Idempotency Mandate:**
   - Every lock call MUST supply an `idempotency_key` (UUIDv4) to prevent double-locking stock during network retries.
2. **Channel Targeting:**
   - Supported channels: `amazon`, `flipkart`, `myntra`, `ondc`, `all`.
   - Never release a lock without a confirmed order completion or explicit cooldown timeout.
3. **Lock Trigger Conditions:**
   - Trigger inventory lock when:
     - `marketplace_webhook_lag_ms > 500ms`, OR
     - `delta_rps > 30` with `stock_remaining < 50 units`, OR
     - `error_rate_5xx > 0.03` on the `/api/checkout` endpoint.

---

## BigQuery Streaming Schema (`telemetry_events`)

Telemetry records streamed by `telemetry-interceptor/` must adhere to this BigQuery schema:

| Column Name | Type | Mode | Description |
| :--- | :--- | :--- | :--- |
| `event_id` | STRING | REQUIRED | Unique event UUID |
| `timestamp` | TIMESTAMP | REQUIRED | Ingestion timestamp |
| `endpoint` | STRING | REQUIRED | Monitored route (e.g. `/api/checkout`) |
| `http_method` | STRING | REQUIRED | `GET`, `POST`, etc. |
| `status_code` | INTEGER | REQUIRED | HTTP response code |
| `latency_ms` | FLOAT | REQUIRED | End-to-end request latency |
| `queue_depth` | INTEGER | NULLABLE | In-flight requests at API gateway |
| `active_instances` | INTEGER | NULLABLE | Cloud Run instance count at event time |
| `channel` | STRING | NULLABLE | Client channel (`web`, `mobile`, `amazon`, etc.) |

---

## Inventory Lock Request Spec

- **Target Endpoint:** `POST /api/inventory/lock` (on `target-store-service`)
- **Request Payload:**
```json
{
  "idempotency_key": "e4b1c872-9b93-4a18-b2ef-3701a2b9e601",
  "sku": "PROD-FLASH-001",
  "safety_stock_lock_units": 20,
  "channels": ["amazon", "flipkart"],
  "reason": "High webhook lag (780ms) and spike velocity detected. Locking safety buffer to prevent oversell.",
  "timestamp": "2026-11-20T11:30:00.000Z"
}
```

- **Expected Response:**
```json
{
  "status": "LOCKED",
  "sku": "PROD-FLASH-001",
  "locked_units": 20,
  "available_units": 15,
  "channels_locked": ["amazon", "flipkart"],
  "lock_timestamp": "2026-11-20T11:30:00.120Z"
}
```
