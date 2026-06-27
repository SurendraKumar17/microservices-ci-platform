package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.uber.org/zap"
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

var tracer = otel.Tracer("payment-service")

// ── Prometheus metrics ─────────────────────────────────────────────────────
// (registered on the default registry, same set of signals as the
// Node services' http_request_duration_seconds / http_requests_total
// pattern, plus a payments-specific counter)
var (
	httpRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "Duration of HTTP requests in seconds",
		Buckets: []float64{0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5},
	}, []string{"method", "route", "status_code"})

	httpRequestTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests",
	}, []string{"method", "route", "status_code"})

	paymentCharges = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "payment_charges_total",
		Help: "Total number of charge attempts",
	}, []string{"status"})
)

// statusRecorder lets us capture the status code written by handlers
// so the metrics middleware can label requests correctly.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// metricsMiddleware mirrors the Node app.use(...) timing/counter middleware.
func metricsMiddleware(route string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		timer := prometheus.NewTimer(prometheus.ObserverFunc(func(v float64) {
			httpRequestDuration.WithLabelValues(r.Method, route, fmt.Sprintf("%d", rec.status)).Observe(v)
		}))
		next(rec, r)
		timer.ObserveDuration()
		httpRequestTotal.WithLabelValues(r.Method, route, fmt.Sprintf("%d", rec.status)).Inc()
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		Logger.Error("writeJSON: failed to encode response", zap.Error(err))
	}
}

func chargeHandler(w http.ResponseWriter, r *http.Request) {
	ctx, span := tracer.Start(r.Context(), "charge_payment")
	defer span.End()

	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "POST only"})
		return
	}
	var req PaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "invalid request body")
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	span.SetAttributes(
		attribute.Int("payment.user_id", req.UserID),
		attribute.String("payment.booking_ref", req.BookingRef),
		attribute.String("payment.currency", req.Currency),
	)

	// idempotency check — look up existing payment in DB
	if req.IdempotencyKey != "" {
		var existing PaymentResult
		err := dbPool.QueryRow(ctx,
			`SELECT transaction_id, status, amount, booking_ref
             FROM payments WHERE idempotency_key = $1`,
			req.IdempotencyKey,
		).Scan(&existing.TransactionID, &existing.Status, &existing.Amount, &existing.BookingRef)
		if err == nil {
			Logger.Info("idempotent charge replay",
				zap.String("idempotency_key", req.IdempotencyKey),
				zap.String("transaction_id", existing.TransactionID),
			)
			paymentCharges.WithLabelValues("idempotent_replay").Inc()
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
		span.RecordError(err)
		span.SetStatus(codes.Error, "db insert failed")
		Logger.Error("insert error", zap.Error(err), zap.String("booking_ref", req.BookingRef))
		paymentCharges.WithLabelValues("error").Inc()
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
		return
	}

	Logger.Info("charge succeeded",
		zap.String("transaction_id", result.TransactionID),
		zap.String("booking_ref", result.BookingRef),
		zap.Float64("amount", result.Amount),
	)
	paymentCharges.WithLabelValues("success").Inc()
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
	initLogger()
	defer Logger.Sync()

	ctx := context.Background()

	shutdownTracing, err := initTracing(ctx)
	if err != nil {
		Logger.Fatal("tracing init failed", zap.Error(err))
	}
	defer func() {
		if err := shutdownTracing(ctx); err != nil {
			Logger.Error("tracing shutdown error", zap.Error(err))
		}
	}()

	if err := connectDB(ctx); err != nil {
		Logger.Fatal("DB connection failed", zap.Error(err))
	}
	defer dbPool.Close()

	if err := initDB(ctx); err != nil {
		Logger.Fatal("DB init failed", zap.Error(err))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ready", readyHandler)
	mux.HandleFunc("/api/payments/charge", metricsMiddleware("/api/payments/charge", chargeHandler))
	mux.Handle("/metrics", promhttp.Handler())

	// wrap the whole mux with otelhttp for automatic span creation per request
	handler := otelhttp.NewHandler(mux, "payment-service")

	Logger.Info("payment-service running", zap.String("port", port))
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		Logger.Fatal("server error", zap.Error(err))
	}
}