/**
 * k6 Staging Smoke Test
 * Target: 10 VUs × 30s  |  p95 < 500ms  |  error rate < 1%
 *
 * Run:
 *   k6 run tests/performance/staging-smoke.js \
 *     --env BASE_URL=https://your-staging-url \
 *     --out json=reports/k6-smoke.json \
 *     --summary-trend-stats="avg,p(95),p(99)"
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ──────────────────────────────────────────────────
const errorRate   = new Rate('error_rate');
const bookingsTrend = new Trend('bookings_duration', true);
const searchTrend   = new Trend('search_duration',   true);

// ── Config ──────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  vus:      10,
  duration: '30s',

  thresholds: {
    // Global latency gate
    'http_req_duration':            ['p(95)<500'],
    // Per-route latency
    'bookings_duration':            ['p(95)<500'],
    'search_duration':              ['p(95)<500'],
    // Error budget
    'error_rate':                   ['rate<0.01'],
    // All checks must pass
    'checks':                       ['rate==1.0'],
  },
};

// ── Helpers ─────────────────────────────────────────────────────────
function get(path, tag) {
  return http.get(`${BASE_URL}${path}`, {
    tags:    { name: tag },
    timeout: '10s',
  });
}

// ── Default scenario ─────────────────────────────────────────────────
export default function () {
  // 1. Gateway health
  const health = get('/health', 'gateway_health');
  check(health, {
    'gateway health 200': (r) => r.status === 200,
  }) || errorRate.add(1);
  errorRate.add(health.status !== 200 ? 1 : 0);

  sleep(0.3);

  // 2. Bookings list
  const bookings = get('/api/bookings', 'bookings_list');
  bookingsTrend.add(bookings.timings.duration);
  check(bookings, {
    'bookings 200':             (r) => r.status === 200,
    'bookings has body':        (r) => r.body && r.body.length > 0,
    'bookings JSON shape':      (r) => {
      try { return JSON.parse(r.body).hasOwnProperty('bookings'); }
      catch (_) { return false; }
    },
  }) || errorRate.add(1);

  sleep(0.3);

  // 3. Search
  const search = get('/api/search?q=test', 'search_query');
  searchTrend.add(search.timings.duration);
  check(search, {
    'search 200':    (r) => r.status === 200,
    'search has body': (r) => r.body && r.body.length > 0,
  }) || errorRate.add(1);

  sleep(0.5);

  // 4. User service health
  const users = get('/api/users/health', 'users_health');
  check(users, {
    'users health 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(0.5);
}

// ── Teardown summary ─────────────────────────────────────────────────
export function handleSummary(data) {
  const p95     = data.metrics['http_req_duration']?.values?.['p(95)'] ?? 'n/a';
  const errRate = data.metrics['error_rate']?.values?.rate ?? 0;
  const checks  = data.metrics['checks']?.values?.rate ?? 0;

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  SMOKE TEST SUMMARY');
  console.log(`  p95 latency : ${typeof p95 === 'number' ? p95.toFixed(1)+'ms' : p95}  (threshold: <500ms)`);
  console.log(`  error rate  : ${(errRate * 100).toFixed(2)}%   (threshold: <1%)`);
  console.log(`  checks pass : ${(checks * 100).toFixed(1)}%`);
  console.log('════════════════════════════════════════');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}