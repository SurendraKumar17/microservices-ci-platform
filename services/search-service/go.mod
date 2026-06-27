module skybook/search-service

go 1.25.0

// NOTE: run `go mod tidy` locally after pulling this branch - I added
// the direct requires below but could not run the Go toolchain in
// this sandbox (no network access to proxy.golang.org) to resolve and
// pin exact indirect dependency versions. `go mod tidy` will fill
// those in correctly and also catch any version drift/build errors.
require (
	github.com/jackc/pgx/v5 v5.9.0
	github.com/prometheus/client_golang v1.19.1
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.51.0
	go.opentelemetry.io/otel v1.26.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.26.0
	go.opentelemetry.io/otel/sdk v1.26.0
	go.uber.org/zap v1.27.0
)