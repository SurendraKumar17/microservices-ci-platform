const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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