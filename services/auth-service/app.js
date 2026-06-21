const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

app.use(express.json());

// in-memory user store - replace with a real DB later
const users = new Map(); // email -> { email, passwordHash, id }
let nextUserId = 1;

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }
  if (users.has(email)) {
    return res.status(409).json({ error: 'user already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: nextUserId++, email, passwordHash };
  users.set(email, user);

  const token = jwt.sign({ sub: user.id, email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user: { id: user.id, email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = users.get(email);
  if (!user) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const token = jwt.sign({ sub: user.id, email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user: { id: user.id, email } });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));
app.get('/ready', (req, res) => res.json({ status: 'ready', service: 'auth-service' }));

app.listen(PORT, () => console.log(`auth-service running on port ${PORT}`));