package interceptor

import "time"

// TelemetryRecord is the incoming raw request measurement.
type TelemetryRecord struct {
	EventID        string    `json:"event_id,omitempty"`
	Timestamp      time.Time `json:"timestamp"`
	Endpoint       string    `json:"endpoint"`
	HTTPMethod     string    `json:"http_method"`
	StatusCode     int       `json:"status_code"`
	LatencyMs      float64   `json:"latency_ms"`
	QueueDepth     int       `json:"queue_depth"`
	ActiveInstances int      `json:"active_instances"`
	Channel        string    `json:"channel,omitempty"`
}

// EndpointMetric represents aggregated telemetry for a single monitored route.
type EndpointMetric struct {
	Endpoint string  `json:"endpoint"`
	RPS      float64 `json:"rps"`
	P95Ms    float64 `json:"p95_ms"`
}

// TelemetryPayload conforms strictly to GEMINI.md Section 4.1 contract.
type TelemetryPayload struct {
	Timestamp                    string           `json:"timestamp"`
	WindowSeconds                int              `json:"window_seconds"`
	CurrentRPS                   float64          `json:"current_rps"`
	DeltaRPS                     float64          `json:"delta_rps"`
	P50LatencyMs                 float64          `json:"p50_latency_ms"`
	P95LatencyMs                 float64          `json:"p95_latency_ms"`
	LatencySlope                 float64          `json:"latency_slope"`
	ErrorRate5xx                 float64          `json:"error_rate_5xx"`
	ActiveInstances              int              `json:"active_instances"`
	CurrentConcurrencyPerInstance float64         `json:"current_concurrency_per_instance"`
	MonitoredEndpoints           []EndpointMetric `json:"monitored_endpoints"`
	MarketplaceWebhookLagMs      float64          `json:"marketplace_webhook_lag_ms"`
}
