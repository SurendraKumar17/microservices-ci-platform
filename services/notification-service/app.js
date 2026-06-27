require('./tracing');

const express = require('express');
const client = require('prom-client');
const { connectDB, getDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Prometheus metrics ────────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const notificationsSent = new client.Counter({
  name: 'notifications_sent_total',
  help: 'Total number of notifications sent',
  labelNames: ['type', 'status'],
  registers: [register],
});

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status_code: res.statusCode };
    end(labels);
    httpRequestTotal.inc(labels);
  });
  next();
});

app.post('/api/notifications/send', async (req, res) => {
  const { type, to, bookingRef, message } = req.body || {};
  if (!type || !to) {
    notificationsSent.inc({ type: type || 'unknown', status: 'bad_request' });
    return res.status(400).json({ error: 'type and to are required' });
  }
  try {
    const notification = {
      type, to, bookingRef,
      message: message || `Your booking ${bookingRef || ''} is confirmed!`,
      sentAt: new Date(),
    };
    const result = await getDB().collection('notifications').insertOne(notification);
    notification.id = result.insertedId;
    notificationsSent.inc({ type, status: 'success' });
    console.log(`[notification-service] sent ${type} to ${to}`);
    res.json({ status: 'sent', notification });
  } catch (err) {
    notificationsSent.inc({ type, status: 'error' });
    console.error('[notification-service] send error:', err.message);
    res.status(500).json({ error: 'internal server error' });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await getDB()
      .collection('notifications')
      .find()
      .sort({ sentAt: -1 })
      .toArray();
    res.json({ notifications });
  } catch (err) {
    console.error('[notification-service] fetch error:', err.message);
    res.status(500).json({ error: 'internal server error' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notification-service' }));

app.get('/ready', async (req, res) => {
  try {
    await getDB().command({ ping: 1 });
    res.json({ status: 'ready', service: 'notification-service' });
  } catch {
    res.status(503).json({ status: 'not ready', service: 'notification-service' });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const start = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`notification-service running on port ${PORT}`));
};
start();