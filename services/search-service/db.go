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
	log.Println("[search-service] PostgreSQL connected")
	return nil
}

func initDB(ctx context.Context) error {
	_, err := dbPool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS flights (
			id             SERIAL PRIMARY KEY,
			flight_number  VARCHAR(20) NOT NULL,
			origin         VARCHAR(10) NOT NULL,
			destination    VARCHAR(10) NOT NULL,
			departure_time TIMESTAMPTZ NOT NULL,
			arrival_time   TIMESTAMPTZ NOT NULL,
			price          NUMERIC(10, 2) NOT NULL,
			currency       VARCHAR(10) NOT NULL DEFAULT 'USD',
			seats_available INTEGER NOT NULL DEFAULT 0,
			created_at     TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create flights table: %w", err)
	}
	log.Println("[search-service] flights table ready")

	_, err = dbPool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS hotels (
			id              SERIAL PRIMARY KEY,
			name            VARCHAR(255) NOT NULL,
			location        VARCHAR(255) NOT NULL,
			check_in        DATE NOT NULL,
			check_out       DATE NOT NULL,
			price_per_night NUMERIC(10, 2) NOT NULL,
			currency        VARCHAR(10) NOT NULL DEFAULT 'USD',
			rooms_available INTEGER NOT NULL DEFAULT 0,
			created_at      TIMESTAMPTZ DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create hotels table: %w", err)
	}
	log.Println("[search-service] hotels table ready")

	return nil
}