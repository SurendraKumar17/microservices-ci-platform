package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
)

type PaymentRequest struct {
	UserID         int     `json:"user_id"`
	Amount         float64 `json:"amount"`
	Currency       string  `json:"currency"`
	BookingRef     string  `json:"booking_ref"`
	IdempotencyKey string  `json:"idempotency_key"`
}

type PaymentResult struct {
	TransactionID string  `json:"transaction_id"`
	Status        string  `json:"status"`
	Amount        float64 `json:"amount"`
	BookingRef    string  `json:"booking_ref"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("writeJSON: failed to encode response: %v", err)
	}
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

	ctx := r.Context()

	// idempotency check — look up existing payment in DB
	if req.IdempotencyKey != "" {
		var existing PaymentResult
		err := dbPool.QueryRow(ctx,
			`SELECT transaction_id, status, amount, booking_ref
			 FROM payments WHERE idempotency_key = $1`,
			req.IdempotencyKey,
		).Scan(&existing.TransactionID, &existing.Status, &existing.Amount, &existing.BookingRef)
		if err == nil {
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

	// persist to DB
	_, err := dbPool.Exec(ctx,
		`INSERT INTO payments (transaction_id, idempotency_key, user_id, amount, currency, booking_ref, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		result.TransactionID, req.IdempotencyKey, req.UserID,
		req.Amount, req.Currency, req.BookingRef, result.Status,
	)
	if err != nil {
		log.Printf("[payment-service] insert error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "payment-service"})
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	if err := dbPool.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not ready", "service": "payment-service"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "service": "payment-service"})
}

func main() {
	ctx := context.Background()

	if err := connectDB(ctx); err != nil {
		log.Fatalf("[payment-service] DB connection failed: %v", err)
	}
	defer dbPool.Close()

	if err := initDB(ctx); err != nil {
		log.Fatalf("[payment-service] DB init failed: %v", err)
	}

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