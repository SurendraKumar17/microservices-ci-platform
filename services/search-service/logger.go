package main

import (
	"os"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Logger is the global structured logger, configured to mirror the
// Node services' Pino setup: JSON output, ISO timestamps, and base
// fields for service name + environment.
var Logger *zap.Logger

func initLogger() {
	level := zapcore.InfoLevel
	if lvl := os.Getenv("LOG_LEVEL"); lvl != "" {
		_ = level.UnmarshalText([]byte(lvl))
	}

	encoderCfg := zapcore.EncoderConfig{
		TimeKey:        "time",
		LevelKey:       "level",
		NameKey:        "logger",
		CallerKey:      "caller",
		MessageKey:     "msg",
		StacktraceKey:  "stacktrace",
		LineEnding:     zapcore.DefaultLineEnding,
		EncodeLevel:    zapcore.LowercaseLevelEncoder,
		EncodeTime:     zapcore.ISO8601TimeEncoder,
		EncodeDuration: zapcore.SecondsDurationEncoder,
		EncodeCaller:   zapcore.ShortCallerEncoder,
	}

	core := zapcore.NewCore(
		zapcore.NewJSONEncoder(encoderCfg),
		zapcore.AddSync(os.Stdout),
		level,
	)

	serviceName := os.Getenv("SERVICE_NAME")
	if serviceName == "" {
		serviceName = "search-service"
	}
	environment := os.Getenv("GO_ENV")
	if environment == "" {
		environment = "dev"
	}

	Logger = zap.New(core).With(
		zap.String("service", serviceName),
		zap.String("environment", environment),
	)
}