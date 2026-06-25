const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI);
let db;

const connectDB = async () => {
  try {
    await client.connect();
    db = client.db(process.env.DB_NAME || 'notification_db');
    console.log('[notification-service] MongoDB connected');
  } catch (err) {
    console.error('[notification-service] MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

const getDB = () => {
  if (!db) throw new Error('DB not initialized - call connectDB first');
  return db;
};

module.exports = { connectDB, getDB };