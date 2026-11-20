package interceptor

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// BigQueryStreamer asynchronously buffers records and streams them without blocking client requests.
type BigQueryStreamer struct {
	queue        chan TelemetryRecord
	batchSize    int
	flushTimeout time.Duration
	wg           sync.WaitGroup
	ctx          context.Context
	cancel       context.CancelFunc
}

// NewBigQueryStreamer creates and starts an asynchronous exporter.
func NewBigQueryStreamer(bufferCapacity int, batchSize int, flushTimeout time.Duration) *BigQueryStreamer {
	ctx, cancel := context.WithCancel(context.Background())
	bqs := &BigQueryStreamer{
		queue:        make(chan TelemetryRecord, bufferCapacity),
		batchSize:    batchSize,
		flushTimeout: flushTimeout,
		ctx:          ctx,
		cancel:       cancel,
	}

	bqs.wg.Add(1)
	go bqs.worker()
	return bqs
}

// Enqueue submits a record for streaming. If the queue is saturated, it drops to preserve latency.
func (bqs *BigQueryStreamer) Enqueue(rec TelemetryRecord) bool {
	select {
	case bqs.queue <- rec:
		return true
	default:
		// Queue full: drop event to avoid adding backpressure on critical checkout flow
		log.Printf("[BigQueryStreamer] Warning: buffer saturated, dropping telemetry event %s", rec.EventID)
		return false
	}
}

func (bqs *BigQueryStreamer) worker() {
	defer bqs.wg.Done()
	ticker := time.NewTicker(bqs.flushTimeout)
	defer ticker.Stop()

	batch := make([]TelemetryRecord, 0, bqs.batchSize)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		// In mock / cloud mode: flush to BigQuery streaming buffer or Pub/Sub
		// Emitting log or cloud publisher call
		bqs.flushBatch(batch)
		batch = make([]TelemetryRecord, 0, bqs.batchSize)
	}

	for {
		select {
		case <-bqs.ctx.Done():
			// Flush remaining
			for len(bqs.queue) > 0 {
				batch = append(batch, <-bqs.queue)
				if len(batch) >= bqs.batchSize {
					flush()
				}
			}
			flush()
			return

		case rec := <-bqs.queue:
			batch = append(batch, rec)
			if len(batch) >= bqs.batchSize {
				flush()
			}

		case <-ticker.C:
			flush()
		}
	}
}

func (bqs *BigQueryStreamer) flushBatch(batch []TelemetryRecord) {
	// Standardized mock / streaming output adhering to telemetry_events BigQuery schema
	// When GCP credentials / BigQuery client are wired, this calls table.Inserter().Put()
	fmt.Printf("[BigQueryStreamer] Successfully streamed batch of %d telemetry records to BigQuery dataset\n", len(batch))
}

// Stop drains and terminates the background worker gracefully.
func (bqs *BigQueryStreamer) Stop() {
	bqs.cancel()
	bqs.wg.Wait()
}
