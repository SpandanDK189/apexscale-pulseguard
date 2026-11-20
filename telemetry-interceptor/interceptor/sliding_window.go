package interceptor

import (
	"math"
	"sort"
	"sync"
	"time"
)

// SlidingWindow maintains a thread-safe rolling window of telemetry events.
type SlidingWindow struct {
	mu            sync.RWMutex
	windowSeconds int
	records       []TelemetryRecord
	lastLagMs     float64
}

// NewSlidingWindow creates a window with the given duration in seconds.
func NewSlidingWindow(windowSeconds int) *SlidingWindow {
	if windowSeconds <= 0 {
		windowSeconds = 15
	}
	return &SlidingWindow{
		windowSeconds: windowSeconds,
		records:       make([]TelemetryRecord, 0, 10000),
		lastLagMs:     0.0,
	}
}

// Record inserts a new telemetry measurement and cleans expired entries.
func (sw *SlidingWindow) Record(rec TelemetryRecord) {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	if rec.Timestamp.IsZero() {
		rec.Timestamp = time.Now().UTC()
	}

	sw.records = append(sw.records, rec)
	sw.evictOldRecords(rec.Timestamp)
}

// UpdateWebhookLag updates the latest measured marketplace webhook latency.
func (sw *SlidingWindow) UpdateWebhookLag(lagMs float64) {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	sw.lastLagMs = lagMs
}

func (sw *SlidingWindow) evictOldRecords(now time.Time) {
	cutoff := now.Add(-time.Duration(sw.windowSeconds) * time.Second)
	idx := 0
	for idx < len(sw.records) && sw.records[idx].Timestamp.Before(cutoff) {
		idx++
	}
	if idx > 0 {
		sw.records = sw.records[idx:]
	}
}

// ComputeSummary evaluates the current rolling window and returns a TelemetryPayload.
func (sw *SlidingWindow) ComputeSummary(now time.Time) TelemetryPayload {
	sw.mu.Lock()
	sw.evictOldRecords(now)
	recs := make([]TelemetryRecord, len(sw.records))
	copy(recs, sw.records)
	lag := sw.lastLagMs
	sw.mu.Unlock()

	totalCount := len(recs)
	windowSecFloat := float64(sw.windowSeconds)

	if totalCount == 0 {
		return TelemetryPayload{
			Timestamp:               now.Format(time.RFC3339),
			WindowSeconds:           sw.windowSeconds,
			CurrentRPS:              0.0,
			DeltaRPS:                0.0,
			P50LatencyMs:            0.0,
			P95LatencyMs:            0.0,
			LatencySlope:            0.0,
			ErrorRate5xx:            0.0,
			ActiveInstances:         1,
			CurrentConcurrencyPerInstance: 0.0,
			MonitoredEndpoints:      []EndpointMetric{},
			MarketplaceWebhookLagMs: lag,
		}
	}

	currentRPS := float64(totalCount) / windowSecFloat

	// Split window in two halves to compute DeltaRPS (slope of change)
	halfDuration := time.Duration(sw.windowSeconds/2) * time.Second
	midpoint := now.Add(-halfDuration)

	var firstHalfCount, secondHalfCount int
	var firstHalfLatencies, secondHalfLatencies []float64
	var allLatencies []float64
	var error5xxCount int
	var latestActiveInstances = 1
	var latestQueueDepth = 0

	endpointStats := make(map[string][]float64)

	for _, r := range recs {
		allLatencies = append(allLatencies, r.LatencyMs)
		endpointStats[r.Endpoint] = append(endpointStats[r.Endpoint], r.LatencyMs)

		if r.StatusCode >= 500 && r.StatusCode <= 599 {
			error5xxCount++
		}
		if r.ActiveInstances > 0 {
			latestActiveInstances = r.ActiveInstances
		}
		latestQueueDepth = r.QueueDepth

		if r.Timestamp.Before(midpoint) {
			firstHalfCount++
			firstHalfLatencies = append(firstHalfLatencies, r.LatencyMs)
		} else {
			secondHalfCount++
			secondHalfLatencies = append(secondHalfLatencies, r.LatencyMs)
		}
	}

	halfSec := float64(sw.windowSeconds) / 2.0
	firstHalfRPS := float64(firstHalfCount) / halfSec
	secondHalfRPS := float64(secondHalfCount) / halfSec
	deltaRPS := secondHalfRPS - firstHalfRPS

	sort.Float64s(allLatencies)
	p50 := calculatePercentile(allLatencies, 50)
	p95 := calculatePercentile(allLatencies, 95)

	// Latency slope: P95(second half) - P95(first half)
	var latencySlope float64
	if len(firstHalfLatencies) > 0 && len(secondHalfLatencies) > 0 {
		sort.Float64s(firstHalfLatencies)
		sort.Float64s(secondHalfLatencies)
		firstP95 := calculatePercentile(firstHalfLatencies, 95)
		secondP95 := calculatePercentile(secondHalfLatencies, 95)
		latencySlope = (secondP95 - firstP95) / halfSec
	}

	errorRate := float64(error5xxCount) / float64(totalCount)

	// Little's Law approximation for concurrency: L = lambda * W
	avgLatencySec := p50 / 1000.0
	inFlightRequests := currentRPS * avgLatencySec
	if float64(latestQueueDepth) > inFlightRequests {
		inFlightRequests = float64(latestQueueDepth)
	}
	concurrencyPerInstance := inFlightRequests / math.Max(1.0, float64(latestActiveInstances))

	// Aggregate monitored endpoints
	var monitored []EndpointMetric
	for ep, lats := range endpointStats {
		sort.Float64s(lats)
		monitored = append(monitored, EndpointMetric{
			Endpoint: ep,
			RPS:      round(float64(len(lats))/windowSecFloat, 1),
			P95Ms:    round(calculatePercentile(lats, 95), 1),
		})
	}

	return TelemetryPayload{
		Timestamp:                     now.Format(time.RFC3339),
		WindowSeconds:                 sw.windowSeconds,
		CurrentRPS:                    round(currentRPS, 1),
		DeltaRPS:                      round(deltaRPS, 1),
		P50LatencyMs:                  round(p50, 1),
		P95LatencyMs:                  round(p95, 1),
		LatencySlope:                  round(latencySlope, 2),
		ErrorRate5xx:                  round(errorRate, 4),
		ActiveInstances:               latestActiveInstances,
		CurrentConcurrencyPerInstance: round(concurrencyPerInstance, 1),
		MonitoredEndpoints:            monitored,
		MarketplaceWebhookLagMs:       round(lag, 1),
	}
}

func calculatePercentile(sorted []float64, percentile float64) float64 {
	n := len(sorted)
	if n == 0 {
		return 0.0
	}
	if n == 1 {
		return sorted[0]
	}
	index := (percentile / 100.0) * float64(n-1)
	lower := int(math.Floor(index))
	upper := int(math.Ceil(index))
	if lower == upper {
		return sorted[lower]
	}
	weight := index - float64(lower)
	return sorted[lower]*(1.0-weight) + sorted[upper]*weight
}

func round(val float64, precision int) float64 {
	pow := math.Pow(10, float64(precision))
	return math.Round(val*pow) / pow
}
