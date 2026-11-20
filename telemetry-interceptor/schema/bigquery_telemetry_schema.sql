-- PulseGuard Telemetry Ingestion DDL for BigQuery
-- Dataset: pulseguard_telemetry
-- Table: telemetry_events

CREATE SCHEMA IF NOT EXISTS `pulseguard_telemetry`
OPTIONS (
  location = 'asia-south1',
  description = 'PulseGuard high-velocity telemetry events and marketplace webhook lag streams'
);

CREATE TABLE IF NOT EXISTS `pulseguard_telemetry.telemetry_events` (
  event_id STRING NOT NULL OPTIONS(description="Unique event UUID generated at the interceptor"),
  timestamp TIMESTAMP NOT NULL OPTIONS(description="Timestamp when request was completed"),
  endpoint STRING NOT NULL OPTIONS(description="Target API route (e.g. /api/checkout, /api/products)"),
  http_method STRING NOT NULL OPTIONS(description="HTTP method GET, POST, etc."),
  status_code INT64 NOT NULL OPTIONS(description="HTTP response status code"),
  latency_ms FLOAT64 NOT NULL OPTIONS(description="End-to-end request latency in milliseconds"),
  queue_depth INT64 OPTIONS(description="In-flight concurrency/queue depth at gateway at time of request"),
  active_instances INT64 OPTIONS(description="Active Cloud Run / container instances handling load"),
  channel STRING OPTIONS(description="Traffic channel: web, mobile, amazon, flipkart, myntra, ondc, d2c")
)
PARTITION BY DATE(timestamp)
CLUSTER BY endpoint, status_code, channel
OPTIONS (
  partition_expiration_days = 7,
  description = "Partitioned and clustered streaming buffer table for real-time traffic slope analysis"
);
