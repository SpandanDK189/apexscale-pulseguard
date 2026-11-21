package interceptor

import (
	"bytes"
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ServiceAccountKey matches standard GCP service account JSON key structure.
type ServiceAccountKey struct {
	Type                    string `json:"type"`
	ProjectID               string `json:"project_id"`
	PrivateKeyID            string `json:"private_key_id"`
	PrivateKey              string `json:"private_key"`
	ClientEmail             string `json:"client_email"`
	ClientID                string `json:"client_id"`
	AuthURI                 string `json:"auth_uri"`
	TokenURI                string `json:"token_uri"`
	AuthProviderX509CertURL string `json:"auth_provider_x509_cert_url"`
	ClientX509CertURL       string `json:"client_x509_cert_url"`
}

// BigQueryStreamer asynchronously buffers records and streams them directly into live GCP BigQuery.
type BigQueryStreamer struct {
	queue        chan TelemetryRecord
	batchSize    int
	flushTimeout time.Duration
	projectID    string
	datasetID    string
	tableID      string
	saKey        *ServiceAccountKey
	parsedKey    *rsa.PrivateKey
	cachedToken  string
	tokenExpiry  time.Time
	tokenMu      sync.Mutex
	httpClient   *http.Client
	wg           sync.WaitGroup
	ctx          context.Context
	cancel       context.CancelFunc
}

// NewBigQueryStreamer creates and starts the streaming exporter.
func NewBigQueryStreamer(bufferCapacity int, batchSize int, flushTimeout time.Duration) *BigQueryStreamer {
	ctx, cancel := context.WithCancel(context.Background())

	bqs := &BigQueryStreamer{
		queue:        make(chan TelemetryRecord, bufferCapacity),
		batchSize:    batchSize,
		flushTimeout: flushTimeout,
		projectID:    "pulseguard-apexscale",
		datasetID:    "pulseguard_telemetry",
		tableID:      "telemetry_events",
		httpClient:   &http.Client{Timeout: 5 * time.Second},
		ctx:          ctx,
		cancel:       cancel,
	}

	// Look for gcp-key.json in current directory or parent
	keyPaths := []string{
		"gcp-key.json",
		"../gcp-key.json",
		filepath.Join(os.Getenv("USERPROFILE"), "gcp-key.json"),
	}

	for _, kp := range keyPaths {
		if data, err := os.ReadFile(kp); err == nil {
			var key ServiceAccountKey
			if err := json.Unmarshal(data, &key); err == nil && key.PrivateKey != "" {
				bqs.saKey = &key
				if key.ProjectID != "" {
					bqs.projectID = key.ProjectID
				}
				// Parse RSA private key for JWT signing
				block, _ := pem.Decode([]byte(key.PrivateKey))
				if block != nil {
					if privKey, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
						if rsaKey, ok := privKey.(*rsa.PrivateKey); ok {
							bqs.parsedKey = rsaKey
							log.Printf("[BigQueryStreamer] Live BigQuery streaming enabled for project: %s (Service Account: %s)", bqs.projectID, key.ClientEmail)
							break
						}
					}
				}
			}
		}
	}

	if bqs.parsedKey == nil {
		log.Printf("[BigQueryStreamer] Running in mock streaming mode (gcp-key.json not loaded)")
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
		bqs.flushBatch(batch)
		batch = make([]TelemetryRecord, 0, bqs.batchSize)
	}

	for {
		select {
		case <-bqs.ctx.Done():
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

// getOAuth2Token obtains a fresh OAuth2 bearer token from Google's token endpoint using RSA-signed JWT.
func (bqs *BigQueryStreamer) getOAuth2Token() (string, error) {
	bqs.tokenMu.Lock()
	defer bqs.tokenMu.Unlock()

	if bqs.cachedToken != "" && time.Now().Before(bqs.tokenExpiry.Add(-2*time.Minute)) {
		return bqs.cachedToken, nil
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"iss":   bqs.saKey.ClientEmail,
		"sub":   bqs.saKey.ClientEmail,
		"aud":   "https://oauth2.googleapis.com/token",
		"scope": "https://www.googleapis.com/auth/bigquery",
		"iat":   now.Unix(),
		"exp":   now.Add(1 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = bqs.saKey.PrivateKeyID

	signedJWT, err := token.SignedString(bqs.parsedKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", signedJWT)

	resp, err := bqs.httpClient.Post(
		"https://oauth2.googleapis.com/token",
		"application/x-www-form-urlencoded",
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return "", fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("token endpoint returned status %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("decode token error: %w", err)
	}

	bqs.cachedToken = tokenResp.AccessToken
	bqs.tokenExpiry = now.Add(time.Duration(tokenResp.ExpiresIn) * time.Second)
	return bqs.cachedToken, nil
}

// flushBatch streams the buffered telemetry records to Google Cloud BigQuery.
func (bqs *BigQueryStreamer) flushBatch(batch []TelemetryRecord) {
	if bqs.parsedKey == nil {
		fmt.Printf("[BigQueryStreamer] [Mock] Streamed batch of %d records (gcp-key.json offline)\n", len(batch))
		return
	}

	token, err := bqs.getOAuth2Token()
	if err != nil {
		log.Printf("[BigQueryStreamer] Error authenticating to BigQuery: %v", err)
		return
	}

	// Construct BigQuery Tabledata insertAll payload
	type RowPayload struct {
		InsertID string                 `json:"insertId"`
		JSON     map[string]interface{} `json:"json"`
	}

	type InsertAllRequest struct {
		Kind string       `json:"kind"`
		Rows []RowPayload `json:"rows"`
	}

	rows := make([]RowPayload, 0, len(batch))
	for _, rec := range batch {
		tsStr := rec.Timestamp.Format(time.RFC3339Nano)
		channel := rec.Channel
		if channel == "" {
			channel = "d2c"
		}

		rows = append(rows, RowPayload{
			InsertID: rec.EventID,
			JSON: map[string]interface{}{
				"event_id":         rec.EventID,
				"timestamp":        tsStr,
				"endpoint":         rec.Endpoint,
				"http_method":      rec.HTTPMethod,
				"status_code":      rec.StatusCode,
				"latency_ms":       rec.LatencyMs,
				"queue_depth":      rec.QueueDepth,
				"active_instances": rec.ActiveInstances,
				"channel":          channel,
			},
		})
	}

	reqPayload := InsertAllRequest{
		Kind: "bigquery#tableDataInsertAllRequest",
		Rows: rows,
	}

	payloadBytes, err := json.Marshal(reqPayload)
	if err != nil {
		log.Printf("[BigQueryStreamer] Error serializing rows: %v", err)
		return
	}

	apiURL := fmt.Sprintf(
		"https://bigquery.googleapis.com/bigquery/v2/projects/%s/datasets/%s/tables/%s/insertAll",
		bqs.projectID, bqs.datasetID, bqs.tableID,
	)

	req, err := http.NewRequestWithContext(bqs.ctx, http.MethodPost, apiURL, bytes.NewReader(payloadBytes))
	if err != nil {
		log.Printf("[BigQueryStreamer] Error creating HTTP request: %v", err)
		return
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := bqs.httpClient.Do(req)
	if err != nil {
		log.Printf("[BigQueryStreamer] BigQuery insertAll network error: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("[BigQueryStreamer] BigQuery API error (status %d): %s", resp.StatusCode, string(respBody))
		return
	}

	var insertAllResp struct {
		InsertErrors []struct {
			Index  int `json:"index"`
			Errors []struct {
				Reason  string `json:"reason"`
				Message string `json:"message"`
			} `json:"errors"`
		} `json:"insertErrors"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&insertAllResp); err == nil && len(insertAllResp.InsertErrors) > 0 {
		log.Printf("[BigQueryStreamer] Inserted with %d row errors: %+v", len(insertAllResp.InsertErrors), insertAllResp.InsertErrors[0])
		return
	}

	log.Printf("🚀 [BigQueryStreamer] Successfully streamed %d telemetry events to BigQuery `%s.%s.%s`",
		len(batch), bqs.projectID, bqs.datasetID, bqs.tableID)
}

// Stop drains and terminates the background worker gracefully.
func (bqs *BigQueryStreamer) Stop() {
	bqs.cancel()
	bqs.wg.Wait()
}
