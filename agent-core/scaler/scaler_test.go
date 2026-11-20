package scaler

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestClampingGuardrails(t *testing.T) {
	tests := []struct {
		input    int
		expected int
	}{
		{input: -5, expected: 1},
		{input: 0, expected: 1},
		{input: 1, expected: 1},
		{input: 8, expected: 8},
		{input: 15, expected: 15},
		{input: 25, expected: 15},
		{input: 100, expected: 15},
	}

	for _, tt := range tests {
		actual := ClampMinInstances(tt.input)
		if actual != tt.expected {
			t.Errorf("ClampMinInstances(%d) = %d; want %d", tt.input, actual, tt.expected)
		}
	}
}

func TestConfidenceGate(t *testing.T) {
	scaler := NewCloudRunScaler(Config{
		ServiceName: "target-store-service",
		DryRun:      true,
	})

	// Low confidence (< 0.85) should be ignored
	lowConfDecision := AgentDecision{
		SurgeDetected:           true,
		ConfidenceScore:         0.72,
		RecommendedMinInstances: 10,
		ActionRequired:          true,
	}

	res := scaler.ApplyDecision(context.Background(), lowConfDecision)
	if res.Status != "IGNORED_LOW_CONFIDENCE" {
		t.Fatalf("Expected IGNORED_LOW_CONFIDENCE, got %s", res.Status)
	}
	if res.MinInstances != 1 {
		t.Fatalf("Expected MinInstances to remain 1, got %d", res.MinInstances)
	}

	// High confidence (>= 0.85) should be applied and clamped
	highConfDecision := AgentDecision{
		SurgeDetected:           true,
		ConfidenceScore:         0.94,
		RecommendedMinInstances: 20, // should clamp to 15
		ActionRequired:          true,
		Reasoning:               "Flash sale traffic acceleration detected",
	}

	resHigh := scaler.ApplyDecision(context.Background(), highConfDecision)
	if resHigh.Status != "APPLIED" {
		t.Fatalf("Expected APPLIED, got %s", resHigh.Status)
	}
	if resHigh.MinInstances != 15 {
		t.Fatalf("Expected MinInstances clamped to 15, got %d", resHigh.MinInstances)
	}
}

func TestWatchdogTimeoutCircuitBreaker(t *testing.T) {
	scaler := NewCloudRunScaler(Config{
		ServiceName: "target-store-service",
		DryRun:      true,
	})
	watchdog := NewWatchdog(scaler)

	// Simulated slow agent call exceeding 2000ms
	slowDecisionFn := func(ctx context.Context) (AgentDecision, error) {
		select {
		case <-time.After(2500 * time.Millisecond):
			return AgentDecision{
				SurgeDetected:           true,
				ConfidenceScore:         0.95,
				RecommendedMinInstances: 8,
				ActionRequired:          true,
			}, nil
		case <-ctx.Done():
			return AgentDecision{}, ctx.Err()
		}
	}

	res := watchdog.ExecuteWithTimeout(context.Background(), slowDecisionFn)

	if !res.FailsafeEngaged {
		t.Fatalf("Expected FailsafeEngaged to be true on >2000ms call")
	}
	if res.Status != "FAILSAFE_ENGAGED: Native Autoscaler Active" {
		t.Fatalf("Expected FAILSAFE_ENGAGED status, got: %s", res.Status)
	}
}

func TestWatchdogErrorCircuitBreaker(t *testing.T) {
	scaler := NewCloudRunScaler(Config{
		ServiceName: "target-store-service",
		DryRun:      true,
	})
	watchdog := NewWatchdog(scaler)

	errDecisionFn := func(ctx context.Context) (AgentDecision, error) {
		return AgentDecision{}, errors.New("Gemini API connection error")
	}

	res := watchdog.ExecuteWithTimeout(context.Background(), errDecisionFn)

	if !res.FailsafeEngaged {
		t.Fatalf("Expected FailsafeEngaged to be true on error")
	}
	if res.Status != "FAILSAFE_ENGAGED: Native Autoscaler Active" {
		t.Fatalf("Expected FAILSAFE_ENGAGED status, got: %s", res.Status)
	}
}
