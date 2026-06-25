FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY main.go db.go ./
RUN go build -o search-service main.go db.go

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/search-service ./search-service
EXPOSE 8080
CMD ["./search-service"]