package scaler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

const (
	HardMinInstances       = 1
	HardMaxInstances       = 15
	HardCeilingMaxInstance = 30
	MinConfidenceThreshold = 0.85
)

// CloudRunScaler handles scaling mutations with deterministic guardrails.
type CloudRunScaler struct {
	projectID       string
	region          string
	serviceName     string
	dryRun          bool
	httpClient      *http.Client
	mu              sync.RWMutex
	currentMin      int
	mockStoreURL    string
}

// Config configures the CloudRunScaler.
type Config struct {
	ProjectID    string
	Region       string
	ServiceName  string
	DryRun       bool
	MockStoreURL string
	Timeout      time.Duration
}

// NewCloudRunScaler returns a new instance of the scaler.
func NewCloudRunScaler(cfg Config) *CloudRunScaler {
	if cfg.Timeout <= 0 {
		cfg.Timeout = 2000 * time.Millisecond
	}
	if cfg.MockStoreURL == "" {
		cfg.MockStoreURL = "http://localhost:8000"
	}

	return &CloudRunScaler{
		projectID:    cfg.ProjectID,
		region:       cfg.Region,
		serviceName:  cfg.ServiceName,
		dryRun:       cfg.DryRun,
		mockStoreURL: cfg.MockStoreURL,
		currentMin:   1,
		httpClient: &http.Client{
			Timeout: cfg.Timeout,
		},
	}
}

// ClampMinInstances enforces non-negotiable instance limits (1 <= min <= 15).
func ClampMinInstances(target int) int {
	if target < HardMinInstances {
		return HardMinInstances
	}
	if target > HardMaxInstances {
		return HardMaxInstances
	}
	return target
}

// ApplyDecision applies the agent decision with all guardrails and bounds checks.
func (s *CloudRunScaler) ApplyDecision(ctx context.Context, decision AgentDecision) ScalingResult {
	start := time.Now()
	s.mu.Lock()
	prevMin := s.currentMin
	s.mu.Unlock()

	// 1. Guardrail: Confidence Gate
	if decision.ConfidenceScore < MinConfidenceThreshold {
		return ScalingResult{
			Timestamp:       time.Now().UTC(),
			Status:          "IGNORED_LOW_CONFIDENCE",
			TargetService:   s.serviceName,
			MinInstances:    prevMin,
			PreviousMin:     prevMin,
			ExecutionMs:     time.Since(start).Milliseconds(),
			Reasoning:       fmt.Sprintf("Confidence score %.2f is below non-negotiable threshold %.2f", decision.ConfidenceScore, MinConfidenceThreshold),
			FailsafeEngaged: false,
		}
	}

	// 2. Guardrail: Action Required check
	if !decision.ActionRequired {
		return ScalingResult{
			Timestamp:       time.Now().UTC(),
			Status:          "NO_ACTION_REQUIRED",
			TargetService:   s.serviceName,
			MinInstances:    prevMin,
			PreviousMin:     prevMin,
			ExecutionMs:     time.Since(start).Milliseconds(),
			Reasoning:       decision.Reasoning,
			FailsafeEngaged: false,
		}
	}

	// 3. Guardrail: Clamp min_instances strictly between 1 and 15
	targetInstances := ClampMinInstances(decision.RecommendedMinInstances)

	// 4. Optionally trigger multi-channel inventory lock
	if decision.LockExternalInventory {
		go s.triggerInventoryLock(decision)
	}

	// 5. Execute scaling mutation (Live GCP API or DryRun)
	if s.dryRun || s.projectID == "" {
		s.mu.Lock()
		s.currentMin = targetInstances
		s.mu.Unlock()

		log.Printf("[CloudRunScaler] [DRY RUN] Scaled %s: min_instances %d -> %d (Reason: %s)",
			s.serviceName, prevMin, targetInstances, decision.Reasoning)

		return ScalingResult{
			Timestamp:       time.Now().UTC(),
			Status:          "APPLIED",
			TargetService:   s.serviceName,
			MinInstances:    targetInstances,
			PreviousMin:     prevMin,
			ExecutionMs:     time.Since(start).Milliseconds(),
			Reasoning:       decision.Reasoning,
			FailsafeEngaged: false,
		}
	}

	// Live Google Cloud Run Admin API v2 call
	err := s.patchCloudRunService(ctx, targetInstances)
	if err != nil {
		log.Printf("[CloudRunScaler] Cloud Run API patch error: %v. Engaging native autoscaler.", err)
		return ScalingResult{
			Timestamp:       time.Now().UTC(),
			Status:          "FAILSAFE_ENGAGED: Native Autoscaler Active",
			TargetService:   s.serviceName,
			MinInstances:    prevMin,
			PreviousMin:     prevMin,
			ExecutionMs:     time.Since(start).Milliseconds(),
			Reasoning:       fmt.Sprintf("Cloud Run Admin API error: %v", err),
			FailsafeEngaged: true,
		}
	}

	s.mu.Lock()
	s.currentMin = targetInstances
	s.mu.Unlock()

	return ScalingResult{
		Timestamp:       time.Now().UTC(),
		Status:          "APPLIED",
		TargetService:   s.serviceName,
		MinInstances:    targetInstances,
		PreviousMin:     prevMin,
		ExecutionMs:     time.Since(start).Milliseconds(),
		Reasoning:       decision.Reasoning,
		FailsafeEngaged: false,
	}
}

func (s *CloudRunScaler) patchCloudRunService(ctx context.Context, minInstances int) error {
	url := fmt.Sprintf("https://run.googleapis.com/v2/projects/%s/locations/%s/services/%s?updateMask=template.scaling.minInstanceCount",
		s.projectID, s.region, s.serviceName)

	payload := map[string]interface{}{
		"template": map[string]interface{}{
			"scaling": map[string]interface{}{
				"minInstanceCount": minInstances,
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API response %d: %s", resp.StatusCode, string(respBytes))
	}

	return nil
}

func (s *CloudRunScaler) triggerInventoryLock(decision AgentDecision) {
	channels := decision.LockChannels
	if len(channels) == 0 {
		channels = []string{"all"}
	}

	lockReq := InventoryLockPayload{
		IdempotencyKey:       fmt.Sprintf("lock-%d", time.Now().UnixNano()),
		SKU:                  "PROD-FLASH-001",
		SafetyStockLockUnits: 20,
		Channels:             channels,
		Reason:               decision.Reasoning,
		Timestamp:            time.Now().UTC().Format(time.RFC3339),
	}

	data, err := json.Marshal(lockReq)
	if err != nil {
		return
	}

	targetURL := fmt.Sprintf("%s/api/inventory/lock", s.mockStoreURL)
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(data))
	if err != nil {
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		log.Printf("[CloudRunScaler] Inventory lock call failed: %v", err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[CloudRunScaler] Inventory lock dispatched successfully to channels: %v", channels)
}
