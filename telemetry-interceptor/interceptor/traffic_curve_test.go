package interceptor

import (
	"fmt"
	"math/rand"
	"testing"
	"time"
)

func TestFullTrafficCurveAndWindowSlope(t *testing.T) {
	window := NewSlidingWindow(15)
	now := time.Now().UTC()

	// 1. Baseline: 5 RPS for 7 seconds (lower latencies ~120ms)
	for sec := 14; sec >= 8; sec-- {
		ts := now.Add(-time.Duration(sec) * time.Second)
		for req := 0; req < 5; req++ {
			window.Record(TelemetryRecord{
				Timestamp:       ts.Add(time.Duration(req*180) * time.Millisecond),
				Endpoint:        "/api/checkout",
				HTTPMethod:      "POST",
				StatusCode:      200,
				LatencyMs:       110.0 + rand.Float64()*30.0,
				QueueDepth:      1,
				ActiveInstances: 1,
				Channel:         "amazon",
			})
		}
	}

	// 2. Surge Flash Sale: 80 RPS for 7 seconds (latencies escalating to ~600-800ms)
	for sec := 7; sec >= 0; sec-- {
		ts := now.Add(-time.Duration(sec) * time.Second)
		for req := 0; req < 80; req++ {
			statusCode := 200
			if rand.Float64() < 0.04 {
				statusCode = 503
			}
			window.Record(TelemetryRecord{
				Timestamp:       ts.Add(time.Duration(req*12) * time.Millisecond),
				Endpoint:        "/api/checkout",
				HTTPMethod:      "POST",
				StatusCode:      statusCode,
				LatencyMs:       350.0 + rand.Float64()*450.0,
				QueueDepth:      8,
				ActiveInstances: 2,
				Channel:         "flipkart",
			})
		}
	}

	window.UpdateWebhookLag(680.0)
	summary := window.ComputeSummary(now)

	fmt.Println("\n=======================================================")
	fmt.Printf("📊 Live Telemetry Evaluation Result:\n")
	fmt.Printf("  • Current RPS:                 %.1f RPS\n", summary.CurrentRPS)
	fmt.Printf("  • Delta RPS (Acceleration):    +%.1f RPS (Slope detected!)\n", summary.DeltaRPS)
	fmt.Printf("  • P50 Latency:                 %.1f ms\n", summary.P50LatencyMs)
	fmt.Printf("  • P95 Latency:                 %.1f ms\n", summary.P95LatencyMs)
	fmt.Printf("  • Latency Slope:               %.2f ms/s\n", summary.LatencySlope)
	fmt.Printf("  • 5xx Error Rate:              %.2f%%\n", summary.ErrorRate5xx*100)
	fmt.Printf("  • Webhook Lag:                 %.1f ms\n", summary.MarketplaceWebhookLagMs)
	fmt.Printf("  • Concurrency / Instance:      %.1f\n", summary.CurrentConcurrencyPerInstance)
	fmt.Println("=======================================================")

	if summary.DeltaRPS <= 0 {
		t.Fatalf("Expected positive DeltaRPS, got %.2f", summary.DeltaRPS)
	}
	if summary.LatencySlope <= 0 {
		t.Fatalf("Expected positive LatencySlope, got %.2f", summary.LatencySlope)
	}
	if summary.P95LatencyMs < 400.0 {
		t.Fatalf("Expected P95 Latency >= 400ms during surge, got %.2f", summary.P95LatencyMs)
	}
}
