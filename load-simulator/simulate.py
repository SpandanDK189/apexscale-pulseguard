#!/usr/bin/env python3
"""
PulseGuard Flash-Sale Load Simulator
Simulates realistic e-commerce traffic curves:
1. Baseline Phase (e.g. 5 RPS)
2. Sudden Flash-Sale Burst (e.g. 150-200 RPS)
3. Cooldown Phase (e.g. 10 RPS)
Outputs live per-second telemetry & latency metrics matching GEMINI.md channels and SKU.
"""

import sys
import time
import uuid
import random
import asyncio
import argparse
from typing import List, Dict, Any
import httpx

CHANNELS = ["amazon", "flipkart", "myntra", "ondc", "d2c"]
SKU = "PROD-FLASH-001"

class LoadSimulator:
    def __init__(
        self,
        target_url: str,
        baseline_rps: int = 5,
        spike_rps: int = 150,
        baseline_duration: int = 10,
        spike_duration: int = 25,
        cooldown_duration: int = 15,
        concurrency_limit: int = 300
    ):
        self.target_url = target_url.rstrip("/")
        self.baseline_rps = baseline_rps
        self.spike_rps = spike_rps
        self.baseline_duration = baseline_duration
        self.spike_duration = spike_duration
        self.cooldown_duration = cooldown_duration
        self.total_duration = baseline_duration + spike_duration + cooldown_duration
        self.semaphore = asyncio.Semaphore(concurrency_limit)
        
        # Telemetry storage
        self.stats_by_second: Dict[int, Dict[str, Any]] = {}
        self.active_tasks: List[asyncio.Task] = []

    def get_target_rps_for_elapsed(self, elapsed: float) -> (int, str):
        if elapsed < self.baseline_duration:
            return self.baseline_rps, "BASELINE"
        elif elapsed < (self.baseline_duration + self.spike_duration):
            return self.spike_rps, "FLASH_SALE_BURST 🔥"
        else:
            return max(5, self.baseline_rps * 2), "COOLDOWN"

    async def send_checkout_request(self, client: httpx.AsyncClient, second_bucket: int):
        async with self.semaphore:
            start_ts = time.perf_counter()
            channel = random.choice(CHANNELS)
            payload = {
                "sku": SKU,
                "product_id": SKU,
                "quantity": 1,
                "channel": channel,
                "customer_id": f"cust-{uuid.uuid4().hex[:6]}"
            }
            
            try:
                # 85% checkouts, 15% catalog browse
                if random.random() < 0.85:
                    resp = await client.post(
                        f"{self.target_url}/api/checkout",
                        json=payload,
                        headers={"X-Client-Channel": channel},
                        timeout=5.0
                    )
                else:
                    resp = await client.get(
                        f"{self.target_url}/api/products",
                        headers={"X-Client-Channel": channel},
                        timeout=5.0
                    )
                
                latency_ms = (time.perf_counter() - start_ts) * 1000.0
                status_code = resp.status_code

            except httpx.TimeoutException:
                latency_ms = (time.perf_counter() - start_ts) * 1000.0
                status_code = 504  # Gateway / Client Timeout
            except Exception:
                latency_ms = (time.perf_counter() - start_ts) * 1000.0
                status_code = 599  # Connection error / dropped

            # Record in bucket
            bucket = self.stats_by_second.setdefault(
                second_bucket,
                {"200": 0, "503": 0, "400": 0, "409": 0, "other": 0, "latencies": []}
            )
            bucket["latencies"].append(latency_ms)
            if status_code == 200:
                bucket["200"] += 1
            elif status_code == 503:
                bucket["503"] += 1
            elif status_code == 400:
                bucket["400"] += 1
            elif status_code == 409:
                bucket["409"] += 1  # 409 Conflict when channel is locked by PulseGuard!
            else:
                bucket["other"] += 1

    async def run(self):
        print("=" * 90)
        print(f"🚀 PulseGuard Flash-Sale Traffic Simulator")
        print(f"Target URL:        {self.target_url}")
        print(f"Target SKU:        {SKU}")
        print(f"Baseline:          {self.baseline_rps} RPS for {self.baseline_duration}s")
        print(f"Spike Burst:       {self.spike_rps} RPS for {self.spike_duration}s")
        print(f"Cooldown:          {max(5, self.baseline_rps * 2)} RPS for {self.cooldown_duration}s")
        print(f"Total Test Time:   {self.total_duration}s")
        print("=" * 90)
        print(f"{'SEC':<4} | {'PHASE':<22} | {'TARGET':<7} | {'200 OK':<8} | {'503 ERR':<8} | {'409 LOCK':<8} | {'OOS 400':<8} | {'P95 LAT':<10}")
        print("-" * 90)

        limits = httpx.Limits(max_keepalive_connections=200, max_connections=400)
        timeout = httpx.Timeout(10.0, connect=3.0)
        
        async with httpx.AsyncClient(limits=limits, timeout=timeout) as client:
            overall_start = time.perf_counter()
            current_sec = 0
            
            while current_sec < self.total_duration:
                sec_start = time.perf_counter()
                elapsed = sec_start - overall_start
                target_rps, phase_name = self.get_target_rps_for_elapsed(elapsed)
                
                # Launch requests for this second
                batch_tasks = []
                for _ in range(target_rps):
                    t = asyncio.create_task(self.send_checkout_request(client, current_sec))
                    batch_tasks.append(t)
                    self.active_tasks.append(t)

                # Wait for remainder of the second
                time_taken = time.perf_counter() - sec_start
                sleep_time = max(0.0, 1.0 - time_taken)
                await asyncio.sleep(sleep_time)

                # Report stats of the previous completed second (current_sec - 1 if > 0)
                report_sec = current_sec - 1 if current_sec > 0 else 0
                bucket = self.stats_by_second.get(report_sec, {"200": 0, "503": 0, "400": 0, "409": 0, "other": 0, "latencies": []})
                lats = bucket["latencies"]
                p95 = round(sorted(lats)[int(len(lats) * 0.95)], 1) if lats else 0.0

                print(
                    f"{current_sec:<4} | {phase_name:<22} | {target_rps:<7} | "
                    f"{bucket['200']:<8} | {bucket['503']:<8} | {bucket.get('409', 0):<8} | {bucket['400']:<8} | {p95} ms"
                )
                sys.stdout.flush()
                current_sec += 1

            # Drain any remaining tasks
            if self.active_tasks:
                await asyncio.gather(*self.active_tasks, return_exceptions=True)

        print("=" * 90)
        print("✅ Load simulation completed.")
        
        # Summary
        total_200 = sum(b.get("200", 0) for b in self.stats_by_second.values())
        total_503 = sum(b.get("503", 0) for b in self.stats_by_second.values())
        total_409 = sum(b.get("409", 0) for b in self.stats_by_second.values())
        total_400 = sum(b.get("400", 0) for b in self.stats_by_second.values())
        all_lats = [l for b in self.stats_by_second.values() for l in b.get("latencies", [])]
        avg_lat = round(sum(all_lats) / len(all_lats), 1) if all_lats else 0.0
        
        print(f"Summary: Total Requests={len(all_lats)}, 200 OK={total_200}, 503 Crashes={total_503}, 409 Guardrail Locks={total_409}, Out-of-Stock={total_400}, Avg Latency={avg_lat}ms")
        print("=" * 90)

def main():
    parser = argparse.ArgumentParser(description="PulseGuard Flash-Sale Traffic Simulator")
    parser.add_argument("--url", default="http://127.0.0.1:8080", help="Target API Gateway or Store Service URL")
    parser.add_argument("--baseline-rps", type=int, default=5, help="Baseline normal traffic RPS")
    parser.add_argument("--spike-rps", type=int, default=150, help="Flash-sale peak surge RPS")
    parser.add_argument("--baseline-sec", type=int, default=10, help="Duration of baseline phase in seconds")
    parser.add_argument("--spike-sec", type=int, default=20, help="Duration of spike surge phase in seconds")
    parser.add_argument("--cooldown-sec", type=int, default=10, help="Duration of cooldown phase in seconds")
    args = parser.parse_args()

    simulator = LoadSimulator(
        target_url=args.url,
        baseline_rps=args.baseline_rps,
        spike_rps=args.spike_rps,
        baseline_duration=args.baseline_sec,
        spike_duration=args.spike_sec,
        cooldown_duration=args.cooldown_sec
    )
    asyncio.run(simulator.run())

if __name__ == "__main__":
    main()
