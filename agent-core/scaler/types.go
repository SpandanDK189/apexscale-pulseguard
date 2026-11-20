package scaler

import "time"

// AgentDecision represents the decision schema defined in GEMINI.md Section 4.2.
type AgentDecision struct {
	SurgeDetected           bool     `json:"surge_detected"`
	ConfidenceScore         float64  `json:"confidence_score"`
	PredictedPeakRPS        float64  `json:"predicted_peak_rps"`
	RecommendedMinInstances int      `json:"recommended_min_instances"`
	LockExternalInventory   bool     `json:"lock_external_inventory"`
	LockChannels            []string `json:"lock_channels,omitempty"`
	Reasoning               string   `json:"reasoning"`
	ActionRequired          bool     `json:"action_required"`
	FailsafeActive          bool     `json:"failsafe_active,omitempty"`
}

// ScalingResult returns the execution status of a scaling request.
type ScalingResult struct {
	Timestamp      time.Time `json:"timestamp"`
	Status         string    `json:"status"` // APPLIED, IGNORED_LOW_CONFIDENCE, CLAMPED, FAILSAFE_ENGAGED, ERROR
	TargetService  string    `json:"target_service"`
	MinInstances   int       `json:"min_instances"`
	PreviousMin    int       `json:"previous_min"`
	ExecutionMs    int64     `json:"execution_ms"`
	Reasoning      string    `json:"reasoning"`
	FailsafeEngaged bool     `json:"failsafe_engaged"`
}

// InventoryLockPayload represents the idempotent inventory lock request.
type InventoryLockPayload struct {
	IdempotencyKey      string   `json:"idempotency_key"`
	SKU                 string   `json:"sku"`
	SafetyStockLockUnits int     `json:"safety_stock_lock_units"`
	Channels            []string `json:"channels"`
	Reason              string   `json:"reason"`
	Timestamp           string   `json:"timestamp"`
}
