# Target Store Service (PulseGuard Demo Target)

Lightweight flash-sale e-commerce checkout & catalog microservice designed to demonstrate the failure modes of **reactive autoscaling** and the recovery benefits of **PulseGuard's proactive scaling and inventory guardrails**.

## Key Features & Deliberate Bottlenecks
* **Simulated Processing Delay:** ~150–300ms (configurable via `CHECKOUT_DELAY_MS`) to mimic transactional database locks & payment gateway latency.
* **Per-Instance Concurrency Threshold:** Defaults to `10` concurrent requests (configurable via `MAX_CONCURRENCY`). When exceeded or queued too long, instantly throws `503 Service Unavailable`.
* **Multi-Channel Stock Tracking:** Tracks `available_stock`, `locked_stock`, `sold_stock`, and flags `oversell_attempts`.
* **Autonomous Guardrail Endpoint:** `POST /mock-marketplace/lock-stock` allows PulseGuard / Gemini agent to lock safety buffer stock during surges to prevent overselling penalties.
* **Instant Demo Reset:** `POST /api/reset` cleanly clears counters and resets inventory for repeatable demo runs.

## Endpoints
* `GET /health` — Health check & active concurrency report
* `GET /api/products` — Catalog items & live inventory levels
* `POST /api/checkout` — Checkout request (`product_id`, `quantity`, `channel`, `customer_id`)
* `POST /mock-marketplace/lock-stock` — Lock safety stock buffer
* `POST /mock-marketplace/unlock-stock` — Unlock stock
* `GET /api/inventory/status` — Live inventory breakdown & 503 error stats
* `POST /api/reset` — Reset counters & stock
* `POST /api/config` — Update latency & concurrency dynamically

## Local Run
```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```
