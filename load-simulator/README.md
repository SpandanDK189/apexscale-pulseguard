# PulseGuard Flash-Sale Load Simulator

A high-concurrency asynchronous load simulator built to test flash-sale traffic surges against `target-store-service` and API gateways.

## Features
* **Three-Phase Surge Profile:**
  1. **Baseline Phase:** Normal steady-state browsing/buying traffic (default `5 RPS`).
  2. **Flash-Sale Burst Phase:** Sudden traffic explosion (default `150 RPS`).
  3. **Cooldown Phase:** Gradual stabilization (default `10 RPS`).
* **Realistic Traffic Distribution:**
  * 85% Flash-Sale Checkout attempts (`POST /api/checkout`) across random sales channels (`d2c`, `amazon`, `flipkart`, `ondc`).
  * 15% Product catalog views (`GET /api/products`).
* **Live Per-Second Console Metrics:** Tracks real-time RPS, 200 OKs, 503 Service Unavailable (concurrency saturation crashes), 400 Out of Stock, and P95 latency.

## Usage

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Default Flash-Sale Spike
```bash
python simulate.py --url http://127.0.0.1:8080
```

### 3. Customize Traffic Curves
```bash
python simulate.py \
  --url http://127.0.0.1:8080 \
  --baseline-rps 5 \
  --spike-rps 200 \
  --baseline-sec 10 \
  --spike-sec 30 \
  --cooldown-sec 10
```
