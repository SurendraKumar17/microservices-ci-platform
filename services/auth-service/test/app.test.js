const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = 'test-secret';
const app = express();
app.use(express.json());

const users = new Map();
let nextUserId = 1;

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (users.has(email)) return res.status(409).json({ error: 'user already exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: nextUserId++, email, passwordHash };
  users.set(email, user);
  const token = jwt.sign({ sub: user.id, email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user: { id: user.id, email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = users.get(email);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ sub: user.id, email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user: { id: user.id, email } });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));
app.get('/ready',  (req, res) => res.json({ status: 'ready', service: 'auth-service' }));

describe('auth-service', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'auth-service' });
  });

  test('GET /ready returns ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', service: 'auth-service' });
  });

  test('POST /api/auth/register - success', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('test@test.com');
  });

  test('POST /api/auth/register - missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/register - duplicate user', async () => {
    await request(app).post('/api/auth/register').send({ email: 'dup@test.com', password: 'pass' });
    const res = await request(app).post('/api/auth/register').send({ email: 'dup@test.com', password: 'pass' });
    expect(res.status).toBe(409);
  });

  test('POST /api/auth/login - success', async () => {
    await request(app).post('/api/auth/register').send({ email: 'login@test.com', password: 'mypass' });
    const res = await request(app).post('/api/auth/login').send({ email: 'login@test.com', password: 'mypass' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  test('POST /api/auth/login - wrong password', async () => {
    await request(app).post('/api/auth/register').send({ email: 'wrong@test.com', password: 'correct' });
    const res = await request(app).post('/api/auth/login').send({ email: 'wrong@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login - unknown user', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'x' });
    expect(res.status).toBe(401);
  });
});