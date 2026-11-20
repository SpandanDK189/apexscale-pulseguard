package interceptor

import (
	"testing"
	"time"
)

func TestSlidingWindowSummary(t *testing.T) {
	sw := NewSlidingWindow(10)
	now := time.Now().UTC()

	// Feed first half requests (lower rate)
	for i := 0; i < 10; i++ {
		sw.Record(TelemetryRecord{
			Timestamp:  now.Add(-7 * time.Second),
			Endpoint:   "/api/checkout",
			StatusCode: 200,
			LatencyMs:  100.0 + float64(i*5),
			QueueDepth: 2,
			ActiveInstances: 1,
		})
	}

	// Feed second half requests (higher rate to simulate surge acceleration)
	for i := 0; i < 40; i++ {
		sw.Record(TelemetryRecord{
			Timestamp:  now.Add(-2 * time.Second),
			Endpoint:   "/api/checkout",
			StatusCode: 200,
			LatencyMs:  300.0 + float64(i*10),
			QueueDepth: 12,
			ActiveInstances: 2,
		})
	}

	summary := sw.ComputeSummary(now)

	if summary.CurrentRPS <= 0 {
		t.Fatalf("Expected CurrentRPS > 0, got %f", summary.CurrentRPS)
	}
	if summary.DeltaRPS <= 0 {
		t.Fatalf("Expected positive DeltaRPS during traffic acceleration, got %f", summary.DeltaRPS)
	}
	if summary.P95LatencyMs <= summary.P50LatencyMs {
		t.Fatalf("Expected P95 >= P50, got P95=%f, P50=%f", summary.P95LatencyMs, summary.P50LatencyMs)
	}
	if len(summary.MonitoredEndpoints) == 0 {
		t.Fatalf("Expected monitored endpoints, got none")
	}
}
