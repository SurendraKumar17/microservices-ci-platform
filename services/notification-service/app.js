const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// in-memory log of "sent" notifications - replace with real email/SMS provider + SQS later
const sentNotifications = [];

app.post('/api/notifications/send', (req, res) => {
  const { type, to, bookingRef, message } = req.body || {};
  if (!type || !to) {
    return res.status(400).json({ error: 'type and to are required' });
  }

  const notification = {
    id: sentNotifications.length + 1,
    type,            // e.g. "booking-confirmation"
    to,
    bookingRef,
    message: message || `Your booking ${bookingRef || ''} is confirmed!`,
    sentAt: new Date().toISOString(),
  };

  sentNotifications.push(notification);
  console.log(`[notification-service] sent ${type} to ${to}: ${notification.message}`);

  res.json({ status: 'sent', notification });
});

app.get('/api/notifications', (req, res) => {
  res.json({ notifications: sentNotifications });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notification-service' }));
app.get('/ready', (req, res) => res.json({ status: 'ready', service: 'notification-service' }));

app.listen(PORT, () => console.log(`notification-service running on port ${PORT}`));