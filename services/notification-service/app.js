const express = require('express');
const { connectDB, getDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/api/notifications/send', async (req, res) => {
  const { type, to, bookingRef, message } = req.body || {};
  if (!type || !to) {
    return res.status(400).json({ error: 'type and to are required' });
  }

  try {
    const notification = {
      type,
      to,
      bookingRef,
      message: message || `Your booking ${bookingRef || ''} is confirmed!`,
      sentAt: new Date(),
    };

    const result = await getDB().collection('notifications').insertOne(notification);
    notification.id = result.insertedId;

    console.log(`[notification-service] sent ${type} to ${to}: ${notification.message}`);
    res.json({ status: 'sent', notification });
  } catch (err) {
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

const start = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`notification-service running on port ${PORT}`));
};

start();