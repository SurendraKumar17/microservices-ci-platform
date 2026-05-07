/**
 * k6 Staging Load Test
 * Ramp 0→50 VUs over 5m  |  soak 10m  |  ramp-down 2m
 * Thresholds: p95 < 1000ms  |  p99 < 2000ms  |  error rate < 2%
 *
 * Run:
 *   k6 run tests/performance/staging-load.js \
 *     --env BASE_URL=https://your-staging-url \
 *     --out json=reports/k6-load.json \
 *     --summary-trend-stats="avg,p(50),p(95),p(99),max"
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Custom metrics ──────────────────────────────────────────────────
const errorRate     = new Rate('error_rate');
const bookingsTrend = new Trend('bookings_duration', true);
const searchTrend   = new Trend('search_duration',   true);
const usersTrend    = new Trend('users_duration',    true);
const totalErrors   = new Counter('total_errors');

// ── Config ──────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  stages: [
    { duration: '2m',  target: 10  },  // warm-up
    { duration: '3m',  target: 50  },  // ramp to peak
    { duration: '10m', target: 50  },  // soak at peak
    { duration: '2m',  target: 0   },  // ramp-down
  ],

  thresholds: {
    // Overall HTTP
    'http_req_duration':  ['p(95)<1000', 'p(99)<2000'],
    'http_req_failed':    ['rate<0.02'],
    // Per-route
    'bookings_duration':  ['p(95)<1000'],
    'search_duration':    ['p(95)<800'],
    'users_duration':     ['p(95)<500'],
    // Error budget
    'error_rate':         ['rate<0.02'],
    // Checks
    'checks':             ['rate>0.98'],
  },
};

// ── Helpers ─────────────────────────────────────────────────────────
function get(path, tag) {
  return http.get(`${BASE_URL}${path}`, {
    tags:    { name: tag },
    timeout: '15s',
  });
}

function recordError(res, checkPassed) {
  if (!checkPassed) {
    errorRate.add(1);
    totalErrors.add(1);
    console.warn(`[FAIL] ${res.request.url} → ${res.status}`);
  }
}

// ── Scenario weights ─────────────────────────────────────────────────
//  Simulates realistic traffic mix across three user archetypes:
//    40% — browsing (search-heavy)
//    40% — booking flow (bookings list + health checks)
//    20% — admin-style (hits all services)

export default function () {
  const roll = Math.random();

  if (roll < 0.40) {
    // ── Browse scenario ─────────────────────────────────────────────
    group('browse', () => {
      const s1 = get('/api/search?q=test',        'search_test');
      searchTrend.add(s1.timings.duration);
      recordError(s1, check(s1, { 'search 200': (r) => r.status === 200 }));
      sleep(0.5);

      const s2 = get('/api/search?q=availability', 'search_avail');
      searchTrend.add(s2.timings.duration);
      recordError(s2, check(s2, { 'search avail 200': (r) => r.status === 200 }));
      sleep(1);
    });

  } else if (roll < 0.80) {
    // ── Booking scenario ────────────────────────────────────────────
    group('booking', () => {
      const bh = get('/api/bookings/health', 'bookings_health');
      recordError(bh, check(bh, { 'bookings health 200': (r) => r.status === 200 }));
      sleep(0.2);

      const bl = get('/api/bookings', 'bookings_list');
      bookingsTrend.add(bl.timings.duration);
      recordError(bl, check(bl, {
        'bookings 200':        (r) => r.status === 200,
        'bookings JSON shape': (r) => {
          try { return JSON.parse(r.body).hasOwnProperty('bookings'); }
          catch (_) { return false; }
        },
      }));
      sleep(1.5);
    });

  } else {
    // ── Full-stack scenario ──────────────────────────────────────────
    group('full_stack', () => {
      const gw = get('/health',             'gateway_health');
      recordError(gw, check(gw, { 'gateway 200': (r) => r.status === 200 }));
      sleep(0.2);

      const us = get('/api/users/health',   'users_health');
      usersTrend.add(us.timings.duration);
      recordError(us, check(us, { 'users 200': (r) => r.status === 200 }));
      sleep(0.2);

      const sr = get('/api/search/health',  'search_health');
      recordError(sr, check(sr, { 'search health 200': (r) => r.status === 200 }));
      sleep(0.2);

      const bk = get('/api/bookings',       'bookings_list');
      bookingsTrend.add(bk.timings.duration);
      recordError(bk, check(bk, { 'bookings full 200': (r) => r.status === 200 }));
      sleep(1);
    });
  }
}

// ── Teardown summary ─────────────────────────────────────────────────
export function handleSummary(data) {
  const fmt = (k, s = 'p(95)') =>
    data.metrics[k]?.values?.[s] != null
      ? data.metrics[k].values[s].toFixed(1) + 'ms'
      : 'n/a';

  const errRate   = data.metrics['error_rate']?.values?.rate ?? 0;
  const checks    = data.metrics['checks']?.values?.rate     ?? 0;
  const errCount  = data.metrics['total_errors']?.values?.count ?? 0;
  const reqs      = data.metrics['http_reqs']?.values?.count     ?? 0;

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  LOAD TEST SUMMARY');
  console.log(`  total requests  : ${reqs}`);
  console.log(`  total errors    : ${errCount}`);
  console.log(`  error rate      : ${(errRate * 100).toFixed(2)}%  (threshold: <2%)`);
  console.log(`  checks pass     : ${(checks * 100).toFixed(1)}%`);
  console.log('');
  console.log('  Latency p95 by route:');
  console.log(`    overall       : ${fmt('http_req_duration')}  (threshold: <1000ms)`);
  console.log(`    /api/bookings : ${fmt('bookings_duration')}`);
  console.log(`    /api/search   : ${fmt('search_duration')}`);
  console.log(`    /api/users    : ${fmt('users_duration')}`);
  console.log('════════════════════════════════════════');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}