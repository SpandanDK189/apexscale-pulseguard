package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/SpandanDK189/pulseguard/telemetry-interceptor/interceptor"
)

func generateUUID() string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	windowSec := 15
	if ws := os.Getenv("WINDOW_SECONDS"); ws != "" {
		if v, err := strconv.Atoi(ws); err == nil && v > 0 {
			windowSec = v
		}
	}

	log.Printf("[PulseGuard] Starting Telemetry Interceptor (Window: %ds, Port: %s)", windowSec, port)

	window := interceptor.NewSlidingWindow(windowSec)
	streamer := interceptor.NewBigQueryStreamer(50000, 100, 1*time.Second)
	defer streamer.Stop()

	// 1. Health check
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"OK","service":"telemetry-interceptor"}`))
	})

	// 2. Ingest single telemetry event from target-store-service or gateway middleware
	http.HandleFunc("/telemetry/record", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var rec interceptor.TelemetryRecord
		if err := json.NewDecoder(r.Body).Decode(&rec); err != nil {
			http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
			return
		}

		if rec.EventID == "" {
			rec.EventID = generateUUID()
		}
		if rec.Timestamp.IsZero() {
			rec.Timestamp = time.Now().UTC()
		}

		// Insert into in-memory sliding window
		window.Record(rec)

		// Async dispatch to BigQuery streaming buffer
		streamer.Enqueue(rec)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "RECORDED",
			"event_id": rec.EventID,
		})
	})

	// 3. Update marketplace webhook lag
	http.HandleFunc("/telemetry/webhook-lag", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var payload struct {
			LagMs float64 `json:"lag_ms"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		window.UpdateWebhookLag(payload.LagMs)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"UPDATED"}`))
	})

	// 4. Return evaluated sliding window telemetry conforming strictly to GEMINI.md Section 4.1
	http.HandleFunc("/telemetry/window", func(w http.ResponseWriter, r *http.Request) {
		now := time.Now().UTC()
		summary := window.ComputeSummary(now)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		if err := json.NewEncoder(w).Encode(summary); err != nil {
			log.Printf("Error encoding summary: %v", err)
		}
	})

	server := &http.Server{
		Addr:         ":" + port,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	}

	log.Printf("[PulseGuard] Telemetry Interceptor listening on http://localhost:%s", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
}
