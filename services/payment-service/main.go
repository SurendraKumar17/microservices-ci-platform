package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"
)

type PaymentRequest struct {
	UserID       int     `json:"user_id"`
	Amount       float64 `json:"amount"`
	Currency     string  `json:"currency"`
	BookingRef   string  `json:"booking_ref"`
	IdempotencyKey string `json:"idempotency_key"`
}

type PaymentResult struct {
	TransactionID string  `json:"transaction_id"`
	Status        string  `json:"status"`
	Amount        float64 `json:"amount"`
	BookingRef    string  `json:"booking_ref"`
}

var (
	mu                sync.Mutex
	processedPayments = map[string]PaymentResult{} // keyed by idempotency_key
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func chargeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
		return
	}

	var req PaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	mu.Lock()
	defer mu.Unlock()

	// idempotency check - never double-charge on retry
	if req.IdempotencyKey != "" {
		if existing, ok := processedPayments[req.IdempotencyKey]; ok {
			writeJSON(w, http.StatusOK, existing)
			return
		}
	}

	result := PaymentResult{
		TransactionID: fmt.Sprintf("TXN-%d", rand.Intn(900000)+100000),
		Status:        "SUCCESS",
		Amount:        req.Amount,
		BookingRef:    req.BookingRef,
	}

	if req.IdempotencyKey != "" {
		processedPayments[req.IdempotencyKey] = result
	}

	writeJSON(w, http.StatusOK, result)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "payment-service"})
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "service": "payment-service"})
}

func main() {
	rand.Seed(time.Now().UnixNano())

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ready", readyHandler)
	mux.HandleFunc("/api/payments/charge", chargeHandler)

	log.Printf("payment-service running on port %s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}