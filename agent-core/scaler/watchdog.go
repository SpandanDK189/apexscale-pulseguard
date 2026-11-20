package scaler

import (
	"context"
	"fmt"
	"log"
	"time"
)

const (
	HardWatchdogTimeout = 2000 * time.Millisecond
)

// Watchdog wraps an arbitrary agent decision function in a strict 2000ms circuit breaker.
type Watchdog struct {
	timeout time.Duration
	scaler  *CloudRunScaler
}

// NewWatchdog initializes the fail-safe watchdog with a hard 2000ms limit.
func NewWatchdog(scaler *CloudRunScaler) *Watchdog {
	return &Watchdog{
		timeout: HardWatchdogTimeout,
		scaler:  scaler,
	}
}

// ExecuteWithTimeout runs the agent decision function within the 2000ms fail-safe window.
// If the function exceeds 2000ms or fails, it automatically engages the native cloud autoscaler.
func (w *Watchdog) ExecuteWithTimeout(
	parentCtx context.Context,
	decisionFn func(ctx context.Context) (AgentDecision, error),
) ScalingResult {
	start := time.Now()
	ctx, cancel := context.WithTimeout(parentCtx, w.timeout)
	defer cancel()

	type callResult struct {
		decision AgentDecision
		err      error
	}

	doneCh := make(chan callResult, 1)

	go func() {
		dec, err := decisionFn(ctx)
		doneCh <- callResult{decision: dec, err: err}
	}()

	select {
	case <-ctx.Done():
		// Hard timeout (2000ms) exceeded: circuit breaker trips immediately
		elapsed := time.Since(start).Milliseconds()
		log.Printf("[Watchdog] Circuit Breaker Tripped! Agent call exceeded %v (elapsed: %dms). Engaging native autoscaler.", w.timeout, elapsed)

		return ScalingResult{
			Timestamp:       time.Now().UTC(),
			Status:          "FAILSAFE_ENGAGED: Native Autoscaler Active",
			TargetService:   w.scaler.serviceName,
			MinInstances:    w.scaler.currentMin,
			PreviousMin:     w.scaler.currentMin,
			ExecutionMs:     elapsed,
			Reasoning:       fmt.Sprintf("Agent decision exceeded hard 2000ms timeout (%dms elapsed). Control reverted to native reactive autoscaler.", elapsed),
			FailsafeEngaged: true,
		}

	case res := <-doneCh:
		elapsed := time.Since(start).Milliseconds()
		if res.err != nil {
			log.Printf("[Watchdog] Agent call errored: %v. Engaging native autoscaler.", res.err)
			return ScalingResult{
				Timestamp:       time.Now().UTC(),
				Status:          "FAILSAFE_ENGAGED: Native Autoscaler Active",
				TargetService:   w.scaler.serviceName,
				MinInstances:    w.scaler.currentMin,
				PreviousMin:     w.scaler.currentMin,
				ExecutionMs:     elapsed,
				Reasoning:       fmt.Sprintf("Agent call failed with error: %v. Control reverted to native reactive autoscaler.", res.err),
				FailsafeEngaged: true,
			}
		}

		// Success within 2000ms: apply decision with deterministic guardrails
		return w.scaler.ApplyDecision(parentCtx, res.decision)
	}
}
