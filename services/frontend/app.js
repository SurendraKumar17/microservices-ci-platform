const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─────────────────────────────────────────
// Health + readiness (kept simple - no metrics/tracing yet)
// ─────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'frontend' }));
app.get('/ready', (req, res) => res.json({ status: 'ready', service: 'frontend' }));

// serve SkyBook UI — must be last
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ───────────────────────────────────────
// Start
// ───────────────────────────────────────
app.listen(PORT, () => console.log(`Frontend running on port ${PORT}`));