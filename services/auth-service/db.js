const { Pool } = require('pg');

const buildConnectionString = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASSWORD;
  const name = process.env.DB_NAME;

  if (!host) throw new Error('DATABASE_URL or DB_HOST is not set');

  return `postgresql://${user}:${pass}@${host}:${port}/${name}?sslmode=require`;
};

const pool = new Pool({
  connectionString: buildConnectionString(),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[auth-service] Unexpected DB error:', err);
  process.exit(-1);
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('[auth-service] PostgreSQL connected');
    client.release();
  } catch (err) {
    console.error('[auth-service] PostgreSQL connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = { pool, connectDB };