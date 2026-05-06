const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// ─────────────────────────────────────────
// Prometheus metrics
// ─────────────────────────────────────────
client.collectDefaultMetrics({ prefix: 'nodejs_' });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status']
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    });
    end({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    });
  });
  next();
});

// ─────────────────────────────────────────
// DB setup
// ─────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'flights',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: { rejectUnauthorized: false }
});

// ─────────────────────────────────────────
// Seed data function
// ─────────────────────────────────────────
async function seedData() {
  await pool.query(`
    INSERT INTO flights
      (origin, destination, destination_city, departure, arrival, airline, icon, class, duration, stops, price, seats_available)
    VALUES
      -- London
      ('New York (JFK)', 'London (LHR)', 'London', NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 7 hours',  'British Airways',    '✈️',  'Economy',  '7h 00m',  'Direct',           499,  80),
      ('New York (JFK)', 'London (LHR)', 'London', NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 9 hours',  'Emirates',           '🛫', 'Economy',  '9h 00m',  '1 stop',           389,  60),
      ('New York (JFK)', 'London (LHR)', 'London', NOW() + INTERVAL '4 days', NOW() + INTERVAL '4 days 8 hours',  'Virgin Atlantic',    '🛩️', 'Business', '7h 30m',  'Direct',           899,  20),

      -- Paris
      ('New York (JFK)', 'Paris (CDG)',  'Paris',  NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 7 hours',  'Air France',         '✈️',  'Economy',  '7h 20m',  'Direct',           389,  90),
      ('New York (JFK)', 'Paris (CDG)',  'Paris',  NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 9 hours',  'Lufthansa',          '🛩️', 'Economy',  '9h 30m',  '1 stop via FRA',   320,  70),
      ('New York (JFK)', 'Paris (CDG)',  'Paris',  NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days 7 hours',  'Delta Airlines',     '🛫', 'Business', '7h 15m',  'Direct',           799,  15),

      -- Tokyo
      ('New York (JFK)', 'Tokyo (NRT)',  'Tokyo',  NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 14 hours', 'Japan Airlines',     '✈️',  'Economy',  '14h 00m', 'Direct',           699,  75),
      ('New York (JFK)', 'Tokyo (NRT)',  'Tokyo',  NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 16 hours', 'ANA',                '🛫', 'Economy',  '16h 00m', '1 stop',           580,  55),
      ('New York (JFK)', 'Tokyo (NRT)',  'Tokyo',  NOW() + INTERVAL '4 days', NOW() + INTERVAL '4 days 14 hours', 'Singapore Airlines', '✈️',  'Business', '14h 30m', 'Direct',           1299, 10),

      -- Bali
      ('New York (JFK)', 'Bali (DPS)',   'Bali',   NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 20 hours', 'Emirates',           '🛫', 'Economy',  '20h 30m', '1 stop via DXB',   549,  65),
      ('New York (JFK)', 'Bali (DPS)',   'Bali',   NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 22 hours', 'Cathay Pacific',     '✈️',  'Economy',  '22h 00m', '1 stop via HKG',   489,  50),
      ('New York (JFK)', 'Bali (DPS)',   'Bali',   NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days 21 hours', 'Singapore Airlines', '🛩️', 'Business', '21h 00m', '1 stop via SIN',   1499, 8)

    ON CONFLICT DO NOTHING;
  `);
  console.log('Flight data seeded — London, Paris, Tokyo, Bali');
}

// ─────────────────────────────────────────
// Init DB + auto-seed if empty
// ─────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flights (
      id SERIAL PRIMARY KEY,
      origin VARCHAR(100),
      destination VARCHAR(100),
      destination_city VARCHAR(100),
      departure TIMESTAMP,
      arrival TIMESTAMP,
      airline VARCHAR(100),
      icon VARCHAR(10) DEFAULT '✈️',
      class VARCHAR(50) DEFAULT 'Economy',
      duration VARCHAR(20),
      stops VARCHAR(50) DEFAULT 'Direct',
      price DECIMAL(10,2),
      seats_available INT DEFAULT 100,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // auto-seed on first start — no manual curl needed
  const { rows } = await pool.query('SELECT COUNT(*) FROM flights');
  if (parseInt(rows[0].count) === 0) {
    await seedData();
  } else {
    console.log(`DB already has ${rows[0].count} flights — skipping seed`);
  }

  console.log('Search DB initialized');
}

// ─────────────────────────────────────────
// Routes
// ─────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'search' }));

// ─────────────────────────────────────────
// Generic search — destination card click
// GET /api/search?q=paris
// ─────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  try {
    const result = await pool.query(
      `SELECT * FROM flights
       WHERE seats_available > 0
       AND (
         origin ILIKE $1 OR
         destination ILIKE $1 OR
         destination_city ILIKE $1
       )
       ORDER BY price ASC`,
      [`%${q || ''}%`]
    );
    res.json({ flights: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─────────────────────────────────────────
// Flight search — search box
// GET /api/search/flights?from=New York (JFK)&to=London&date=2025-06-15
// Also supports legacy: ?origin=...&destination=...
// ─────────────────────────────────────────
app.get('/api/search/flights', async (req, res) => {
  const { from, to, origin, destination } = req.query;

  // support both from/to (frontend) and origin/destination (legacy)
  const src  = from  || origin  || '';
  const dest = to    || destination || '';

  try {
    const result = await pool.query(
      `SELECT * FROM flights
       WHERE seats_available > 0
       AND ($1 = '' OR origin ILIKE $1)
       AND ($2 = '' OR destination ILIKE $2 OR destination_city ILIKE $2)
       ORDER BY price ASC`,
      [`%${src}%`, `%${dest}%`]
    );
    res.json({ flights: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to search flights' });
  }
});

// ─────────────────────────────────────────
// Hotel search — frontend featured hotels
// GET /api/search/hotels?city=featured
// ─────────────────────────────────────────
app.get('/api/search/hotels', async (req, res) => {
  const hotels = [
    { name: 'The Savoy',         location: 'London, UK',      icon: '🏨', stars: '★★★★★', price: 320,  bg: '#dbeafe' },
    { name: 'Hotel de Crillon',  location: 'Paris, France',   icon: '🏩', stars: '★★★★★', price: 480,  bg: '#fce7f3' },
    { name: 'Park Hyatt Tokyo',  location: 'Tokyo, Japan',    icon: '🗼', stars: '★★★★★', price: 550,  bg: '#dcfce7' },
    { name: 'Four Seasons Bali', location: 'Bali, Indonesia', icon: '🌺', stars: '★★★★★', price: 290,  bg: '#fef3c7' },
    { name: 'Burj Al Arab',      location: 'Dubai, UAE',      icon: '⛵', stars: '★★★★★', price: 1200, bg: '#ede9fe' },
    { name: 'Marina Bay Sands',  location: 'Singapore',       icon: '🌃', stars: '★★★★★', price: 380,  bg: '#ecfeff' },
  ];
  res.json({ hotels });
});

// ─────────────────────────────────────────
// Manual seed endpoint (kept for testing)
// POST /api/search/seed
// ─────────────────────────────────────────
app.post('/api/search/seed', async (req, res) => {
  try {
    await seedData();
    res.json({ message: 'Seeded successfully', routes: ['London', 'Paris', 'Tokyo', 'Bali'] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Seed failed', detail: err.message });
  }
});

// ─────────────────────────────────────────
// Prometheus metrics
// ─────────────────────────────────────────
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// ─────────────────────────────────────────
// Start
// ─────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () =>
    console.log(`Search service running on port ${PORT}`)))
  .catch(err => { console.error(err); process.exit(1); });