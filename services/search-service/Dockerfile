FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go db.go logger.go tracing.go ./
RUN go build -o search-service .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/search-service ./search-service
EXPOSE 8080
CMD ["./search-service"]