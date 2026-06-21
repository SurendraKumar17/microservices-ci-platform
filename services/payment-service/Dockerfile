FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY main.go ./
RUN go build -o payment-service main.go

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/payment-service ./payment-service
EXPOSE 8080
CMD ["./payment-service"]