const pino = require('pino');
const { trace } = require('@opentelemetry/api');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',

  base: {
    service: process.env.SERVICE_NAME || 'notification',
    environment: process.env.NODE_ENV || 'dev'
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  formatters: {
    level(label) {
      return { level: label };
    }
  },

  mixin() {
    const span = trace.getActiveSpan();

    if (!span) {
      return {};
    }

    const ctx = span.spanContext();

    return {
      trace_id: ctx.traceId,
      span_id: ctx.spanId
    };
  }
});

module.exports = logger;