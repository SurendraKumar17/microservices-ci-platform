package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthHandler(t *testing.T) {
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
	if body["service"] != "search-service" {
		t.Errorf("expected service search-service, got %s", body["service"])
	}
}

func TestReadyHandler(t *testing.T) {
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

func TestSearchFlightsHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/search/flights", nil)
	w := httptest.NewRecorder()
	searchFlightsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	flights, ok := body["flights"].([]any)
	if !ok {
		t.Fatal("expected flights array in response")
	}
	if len(flights) == 0 {
		t.Error("expected at least one flight")
	}
}

func TestSearchHotelsHandler(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/search/hotels", nil)
	w := httptest.NewRecorder()
	searchHotelsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	hotels, ok := body["hotels"].([]any)
	if !ok {
		t.Fatal("expected hotels array in response")
	}
	if len(hotels) == 0 {
		t.Error("expected at least one hotel")
	}
}