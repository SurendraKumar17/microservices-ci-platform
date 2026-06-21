/**
 * E2E test suite — microservices staging (Playwright)
 * [QA/DEV TEAM OWNS] Add test cases inside describe blocks.
 *
 * Run:
 *   npx playwright test \
 *     --reporter=html --output=reports/playwright
 *
 * Env:
 *   BASE_URL=https://your-staging-url  (set in playwright.config.ts or env)
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8080';

// ── Helpers ─────────────────────────────────────────────────────────────────
async function goto(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
}

// ── Health / availability ────────────────────────────────────────────────────
test.describe('Service availability', () => {
  test('homepage loads', async ({ page }) => {
    await goto(page, '/');
    await expect(page).not.toHaveTitle(/404|Error/i);
  });

  test('API gateway /health returns 200', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.status()).toBe(200);
  });
});

// ── Bookings flow ────────────────────────────────────────────────────────────
test.describe('Bookings', () => {
  test.skip('view bookings list', async ({ page }) => {
    // TODO: navigate to bookings page and assert list renders
    await goto(page, '/bookings');
    await expect(page.locator('[data-testid="bookings-list"]')).toBeVisible();
  });

  test.skip('create a booking', async ({ page }) => {
    // TODO: fill in booking form, submit, assert confirmation
    await goto(page, '/bookings/new');
    await page.fill('[data-testid="booking-date"]', '2025-12-01');
    await page.click('[data-testid="submit-booking"]');
    await expect(page.locator('[data-testid="booking-confirmation"]')).toBeVisible();
  });
});

// ── Search flow ──────────────────────────────────────────────────────────────
test.describe('Search', () => {
  test.skip('search returns results', async ({ page }) => {
    // TODO: type in search box, assert results appear
    await goto(page, '/');
    await page.fill('[data-testid="search-input"]', 'hotel');
    await page.press('[data-testid="search-input"]', 'Enter');
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });

  test.skip('empty search shows empty state', async ({ page }) => {
    await goto(page, '/search?q=zzznoresultsexpected');
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
  });
});

// ── Auth flow ────────────────────────────────────────────────────────────────
test.describe('Authentication', () => {
  test.skip('user can register', async ({ page }) => {
    await goto(page, '/register');
    await page.fill('[data-testid="email"]',    'e2e-test@example.com');
    await page.fill('[data-testid="password"]', 'Test1234!');
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/dashboard|home/);
  });

  test.skip('user can log in', async ({ page }) => {
    await goto(page, '/login');
    await page.fill('[data-testid="email"]',    'e2e-test@example.com');
    await page.fill('[data-testid="password"]', 'Test1234!');
    await page.click('[data-testid="login-submit"]');
    await expect(page).toHaveURL(/dashboard|home/);
  });

  test.skip('invalid credentials show error', async ({ page }) => {
    await goto(page, '/login');
    await page.fill('[data-testid="email"]',    'bad@example.com');
    await page.fill('[data-testid="password"]', 'wrongpassword');
    await page.click('[data-testid="login-submit"]');
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  });
});

// ── Critical user journey ────────────────────────────────────────────────────
test.describe('Critical path: search → book', () => {
  test.skip('user can search and complete a booking', async ({ page }) => {
    // TODO: full happy-path flow
    await goto(page, '/');
    await page.fill('[data-testid="search-input"]', 'hotel');
    await page.press('[data-testid="search-input"]', 'Enter');
    await page.click('[data-testid="search-result"]:first-child');
    await page.click('[data-testid="book-now"]');
    await page.fill('[data-testid="booking-date"]', '2025-12-01');
    await page.click('[data-testid="confirm-booking"]');
    await expect(page.locator('[data-testid="booking-confirmation"]')).toBeVisible();
  });
});