const request = require('supertest');
const express = require('express');

const app = express();
app.use(express.json());

const sentNotifications = [];

app.post('/api/notifications/send', (req, res) => {
  const { type, to, bookingRef, message } = req.body || {};
  if (!type || !to) return res.status(400).json({ error: 'type and to are required' });
  const notification = {
    id: sentNotifications.length + 1,
    type, to, bookingRef,
    message: message || `Your booking ${bookingRef || ''} is confirmed!`,
    sentAt: new Date().toISOString(),
  };
  sentNotifications.push(notification);
  res.json({ status: 'sent', notification });
});

app.get('/api/notifications', (req, res) => res.json({ notifications: sentNotifications }));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notification-service' }));
app.get('/ready',  (req, res) => res.json({ status: 'ready', service: 'notification-service' }));

describe('notification-service', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'notification-service' });
  });

  test('GET /ready returns ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', service: 'notification-service' });
  });

  test('POST /api/notifications/send - success', async () => {
    const res = await request(app)
      .post('/api/notifications/send')
      .send({ type: 'booking-confirmation', to: 'user@test.com', bookingRef: 'SKY001' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('sent');
    expect(res.body.notification.to).toBe('user@test.com');
  });

  test('POST /api/notifications/send - missing fields', async () => {
    const res = await request(app).post('/api/notifications/send').send({});
    expect(res.status).toBe(400);
  });

  test('GET /api/notifications - returns list', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('notifications');
    expect(Array.isArray(res.body.notifications)).toBe(true);
  });
});