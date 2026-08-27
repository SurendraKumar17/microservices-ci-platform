package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

var dbPool *pgxpool.Pool

func connectDB(ctx context.Context) error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		host := os.Getenv("DB_HOST")
		port := os.Getenv("DB_PORT")
		user := os.Getenv("DB_USER")
		pass := os.Getenv("DB_PASSWORD")
		name := os.Getenv("DB_NAME")
		if host == "" {
			return fmt.Errorf("DATABASE_URL or DB_HOST is not set")
		}
		if port == "" {
			port = "5432"
		}
		dsn = fmt.Sprintf("postgresql://%s:%s@%s:%s/%s?sslmode=require", user, pass, host, port, name)
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	dbPool = pool
	log.Println("[payment-service] PostgreSQL connected")
	return nil
}

func initDB(ctx context.Context) error {
	_, err := dbPool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS payments (
			id              SERIAL PRIMARY KEY,
			transaction_id  VARCHAR(50) UNIQUE NOT NULL,
			idempotency_key VARCHAR(255) UNIQUE,
			user_id         INTEGER NOT NULL,
			amount          NUMERIC(10, 2) NOT NULL,
			currency        VARCHAR(10) NOT NULL,
			booking_ref     VARCHAR(100),
			status          VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
			created_at      TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create payments table: %w", err)
	}
	log.Println("[payment-service] payments table ready")
	return nil
}