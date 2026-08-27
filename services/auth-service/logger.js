const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',

  base: {
    service: process.env.SERVICE_NAME || 'unknown',
    environment: process.env.NODE_ENV || 'dev'
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  formatters: {
    level(label) {
      return { level: label };
    }
  }
});

module.exports = logger;