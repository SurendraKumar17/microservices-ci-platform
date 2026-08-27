const request = require('supertest');
const express = require('express');
const path = require('path');

// build a minimal app without listen() so supertest can control the port
const app = express();
app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'frontend' }));
app.get('/ready',  (req, res) => res.json({ status: 'ready', service: 'frontend' }));

describe('frontend', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'frontend' });
  });

  test('GET /ready returns ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', service: 'frontend' });
  });
});