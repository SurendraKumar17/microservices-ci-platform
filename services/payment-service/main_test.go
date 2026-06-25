package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestPaymentHealthHandler tests the /health endpoint.
// Health check does not require a DB connection.
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

// TestPaymentReadyHandlerNoDB tests /ready when dbPool is nil (no DB connected).
// Should return 503 Service Unavailable.
func TestPaymentReadyHandlerNoDB(t *testing.T) {
	// dbPool is nil in unit tests (no real DB) — ready should return 503
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()
	readyHandler(w, req)

	// Without a DB connection, readyHandler should return 503
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 when DB is not connected, got %d", w.Code)
	}
}

// TestChargeHandlerInvalidMethod tests that non-POST requests are rejected.
// Does not require a DB connection.
func TestChargeHandlerInvalidMethod(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/payments/charge", nil)
	w := httptest.NewRecorder()
	chargeHandler(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

// TestChargeHandlerInvalidBody tests that a malformed request body is rejected.
// Does not require a DB connection.
func TestChargeHandlerInvalidBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/payments/charge",
		bytes.NewReader([]byte("not-valid-json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	chargeHandler(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// TestWriteJSON tests the writeJSON helper directly.
func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()
	writeJSON(w, http.StatusOK, map[string]string{"key": "value"})

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json content type, got %s", ct)
	}
}

// NOTE: TestChargeHandler and TestChargeHandlerIdempotency require a real
// PostgreSQL connection and are intentionally omitted from unit tests.
// They will be covered by integration tests in tests/integration/ once
// the staging environment and test DB are configured.