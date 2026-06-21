FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY main.go ./
RUN go build -o search-service main.go

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/search-service ./search-service
EXPOSE 8080
CMD ["./search-service"]