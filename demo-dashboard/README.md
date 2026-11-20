# PulseGuard Demo Dashboard (Team ApexScale)

Split-screen live comparison UI for the Google DeepMind & Google Cloud Startup Buildathon India 2026 jury demonstration.

## Features
* **Side-by-Side Live Comparison:**
  * **Left (Before):** Native reactive cloud autoscaling showing the 2–5 min container provisioning lag, cascading 503 errors, skyrocketing P95 latency, and marketplace stock overselling penalties.
  * **Right (After):** PulseGuard autonomous resilience agent powered by Gemini, demonstrating proactive pre-warm scaling ahead of traffic spikes, 0 dropped requests, stable ~180ms latency, and automated safety stock locking.
* **Fail-Safe Watchdog Simulator:** Toggle the 2000ms circuit-breaker fallback to show instant reversion to `FAILSAFE_ENGAGED: Native Autoscaler Active`.
* **One-Click Flash Sale Trigger:** Simulate a 180–200 RPS flash-sale surge at the touch of a button.

## Setup & Running Locally
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
