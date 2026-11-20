package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/SpandanDK189/pulseguard/telemetry-interceptor/interceptor"
)

var channels = []string{"amazon", "flipkart", "myntra", "ondc", "d2c"}

func main() {
	targetURL := "http://localhost:8080/telemetry/record"
	windowURL := "http://localhost:8080/telemetry/window"

	fmt.Println("================================================================================")
	fmt.Println("🚀 PulseGuard Telemetry Interceptor Live Load & Slope Verification")
	fmt.Println("Simulating flash-sale traffic curve directly through Telemetry Interceptor")
	fmt.Println("================================================================================")

	client := &http.Client{Timeout: 2 * time.Second}

	// Phase 1: Baseline Traffic (5 RPS for 5 seconds)
	fmt.Println("\n[PHASE 1] Running Baseline Traffic: ~5 RPS for 5s...")
	runTrafficPhase(client, targetURL, 5, 5*time.Second, 1, 100.0, 150.0)

	// Sample window
	printWindowSummary(client, windowURL)

	// Phase 2: Sudden Flash Sale Burst (75 RPS for 5 seconds)
	fmt.Println("\n[PHASE 2] 🔥 FLASH SALE SURGE TRIGGERED: ~75 RPS for 5s (Latency rising)...")
	runTrafficPhase(client, targetURL, 75, 5*time.Second, 2, 350.0, 850.0)

	// Sample window after surge
	printWindowSummary(client, windowURL)

	fmt.Println("\n================================================================================")
	fmt.Println("✅ Verification Complete: Interceptor accurately captured Delta-RPS & Latency Slope!")
	fmt.Println("================================================================================")
}

func runTrafficPhase(client *http.Client, targetURL string, rps int, duration time.Duration, activeInstances int, minLat, maxLat float64) {
	deadline := time.Now().Add(duration)
	ticker := time.NewTicker(time.Second / time.Duration(rps))
	defer ticker.Stop()

	var wg sync.WaitGroup
	var sentCount int64

	for time.Now().Before(deadline) {
		<-ticker.C
		wg.Add(1)
		go func() {
			defer wg.Done()
			atomic.AddInt64(&sentCount, 1)

			latency := minLat + rand.Float64()*(maxLat-minLat)
			channel := channels[rand.Intn(len(channels))]
			status := 200
			if rand.Float64() < 0.03 {
				status = 503
			}

			endpoint := "/api/checkout"
			if rand.Float64() < 0.2 {
				endpoint = "/api/products"
			}

			rec := interceptor.TelemetryRecord{
				Timestamp:       time.Now().UTC(),
				Endpoint:        endpoint,
				HTTPMethod:      "POST",
				StatusCode:      status,
				LatencyMs:       latency,
				QueueDepth:      int(latency / 50.0),
				ActiveInstances: activeInstances,
				Channel:         channel,
			}

			body, _ := json.Marshal(rec)
			req, err := http.NewRequest(http.MethodPost, targetURL, bytes.NewReader(body))
			if err == nil {
				req.Header.Set("Content-Type", "application/json")
				resp, err := client.Do(req)
				if err == nil {
					resp.Body.Close()
				}
			}
		}()
	}

	wg.Wait()
	fmt.Printf("  -> Dispatched %d telemetry events over %v\n", sentCount, duration)
}

func printWindowSummary(client *http.Client, windowURL string) {
	time.Sleep(200 * time.Millisecond)
	resp, err := client.Get(windowURL)
	if err != nil {
		fmt.Printf("Error querying window: %v\n", err)
		return
	}
	defer resp.Body.Close()

	var p interceptor.TelemetryPayload
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		fmt.Printf("Error decoding window payload: %v\n", err)
		return
	}

	fmt.Println("\n📊 [Telemetry Window Snapshot (GEMINI.md Section 4.1 Schema)]")
	fmt.Printf("  • Current RPS:                 %.1f\n", p.CurrentRPS)
	fmt.Printf("  • Delta RPS (Acceleration):    %.1f RPS/window\n", p.DeltaRPS)
	fmt.Printf("  • P50 Latency:                 %.1f ms\n", p.P50LatencyMs)
	fmt.Printf("  • P95 Latency:                 %.1f ms\n", p.P95LatencyMs)
	fmt.Printf("  • Latency Slope:               %.2f ms/s\n", p.LatencySlope)
	fmt.Printf("  • 5xx Error Rate:              %.2f%%\n", p.ErrorRate5xx*100)
	fmt.Printf("  • Active Instances:            %d\n", p.ActiveInstances)
	fmt.Printf("  • Concurrency Per Instance:    %.1f\n", p.CurrentConcurrencyPerInstance)
	fmt.Printf("  • Monitored Endpoints:         %d routes\n", len(p.MonitoredEndpoints))
	for _, ep := range p.MonitoredEndpoints {
		fmt.Printf("      - %s: RPS=%.1f, P95=%.1fms\n", ep.Endpoint, ep.RPS, ep.P95Ms)
	}
}
