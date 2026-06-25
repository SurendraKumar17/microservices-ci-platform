FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go db.go ./
RUN go build -o payment-service .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/payment-service ./payment-service
EXPOSE 8080
CMD ["./payment-service"]