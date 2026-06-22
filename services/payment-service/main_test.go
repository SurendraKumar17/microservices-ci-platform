package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPaymentHealthHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	healthHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status ok, got %s", body["status"])
	}
	if body["service"] != "payment-service" {
		t.Errorf("expected service payment-service, got %s", body["service"])
	}
}

func TestPaymentReadyHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()
	readyHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "ready" {
		t.Errorf("expected status ready, got %s", body["status"])
	}
}

func TestChargeHandler(t *testing.T) {
	payload := PaymentRequest{
		UserID:         1,
		Amount:         99.99,
		Currency:       "USD",
		BookingRef:     "SKY001",
		IdempotencyKey: "test-key-001",
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/payments/charge", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	chargeHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var result PaymentResult
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.Status != "SUCCESS" {
		t.Errorf("expected SUCCESS, got %s", result.Status)
	}
	if result.Amount != 99.99 {
		t.Errorf("expected amount 99.99, got %f", result.Amount)
	}
	if result.BookingRef != "SKY001" {
		t.Errorf("expected BookingRef SKY001, got %s", result.BookingRef)
	}
}

func TestChargeHandlerIdempotency(t *testing.T) {
	mu.Lock()
	processedPayments = map[string]PaymentResult{}
	mu.Unlock()

	payload := PaymentRequest{
		UserID:         1,
		Amount:         50.00,
		Currency:       "USD",
		BookingRef:     "SKY002",
		IdempotencyKey: "idem-key-002",
	}
	body, _ := json.Marshal(payload)

	req1 := httptest.NewRequest(http.MethodPost, "/api/payments/charge", bytes.NewReader(body))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	chargeHandler(w1, req1)
	var result1 PaymentResult
	if err := json.NewDecoder(w1.Body).Decode(&result1); err != nil {
		t.Fatalf("failed to decode first response: %v", err)
	}

	body2, _ := json.Marshal(payload)
	req2 := httptest.NewRequest(http.MethodPost, "/api/payments/charge", bytes.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	chargeHandler(w2, req2)
	var result2 PaymentResult
	if err := json.NewDecoder(w2.Body).Decode(&result2); err != nil {
		t.Fatalf("failed to decode second response: %v", err)
	}

	if result1.TransactionID != result2.TransactionID {
		t.Errorf("idempotency failed: got different transaction IDs %s vs %s",
			result1.TransactionID, result2.TransactionID)
	}
}

func TestChargeHandlerInvalidMethod(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/payments/charge", nil)
	w := httptest.NewRecorder()
	chargeHandler(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}