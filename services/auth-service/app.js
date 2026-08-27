require('./tracing');

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const client = require('prom-client');
const { pool, connectDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

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

const authRegistrations = new client.Counter({
  name: 'auth_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['status'],
  registers: [register],
});

const authLogins = new client.Counter({
  name: 'auth_logins_total',
  help: 'Total number of login attempts',
  labelNames: ['status'],
  registers: [register],
});

// middleware to track all requests
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status_code: res.statusCode };
    end(labels);
    httpRequestTotal.inc(labels);
  });
  next();
});

// ── DB bootstrap ──────────────────────────────────────────────────────────────
const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      email       VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[auth-service] users table ready');
};

// ── Routes ────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    authRegistrations.inc({ status: 'bad_request' });
    return res.status(400).json({ error: 'email and password required' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
      [email, passwordHash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    authRegistrations.inc({ status: 'success' });
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      authRegistrations.inc({ status: 'conflict' });
      return res.status(409).json({ error: 'user already exists' });
    }
    authRegistrations.inc({ status: 'error' });
    console.error('[auth-service] register error:', err.message);
    res.status(500).json({ error: 'internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    authLogins.inc({ status: 'bad_request' });
    return res.status(400).json({ error: 'email and password required' });
  }
  try {
    const result = await pool.query(
      `SELECT id, email, password_hash FROM users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      authLogins.inc({ status: 'invalid_credentials' });
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      authLogins.inc({ status: 'invalid_credentials' });
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    authLogins.inc({ status: 'success' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    authLogins.inc({ status: 'error' });
    console.error('[auth-service] login error:', err.message);
    res.status(500).json({ error: 'internal server error' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));

app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', service: 'auth-service' });
  } catch {
    res.status(503).json({ status: 'not ready', service: 'auth-service' });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const start = async () => {
  await connectDB();
  await initDB();
  app.listen(PORT, () => console.log(`auth-service running on port ${PORT}`));
};
start();