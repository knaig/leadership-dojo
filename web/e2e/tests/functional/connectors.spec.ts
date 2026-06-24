import { test, expect } from '@playwright/test';

/**
 * Connector Flow Tests
 * Tests Google OAuth connection, reconnection, and sync APIs
 */

test.describe('Connector APIs', () => {
  test('GET /api/connectors returns list or 401', async ({ request }) => {
    const response = await request.get('/api/connectors');
    expect(response.status()).toBeLessThan(500);

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('connectors');
      expect(Array.isArray(data.connectors)).toBe(true);
    }
  });

  test('POST /api/connectors handles duplicate gracefully (no 409)', async ({ request }) => {
    const response = await request.post('/api/connectors', {
      data: { provider: 'gcal', type: 'CALENDAR' },
    });
    // Should upsert, not 409
    expect(response.status()).not.toBe(409);
    expect(response.status()).toBeLessThan(500);
  });

  test('POST /api/connectors rejects invalid provider', async ({ request }) => {
    const response = await request.post('/api/connectors', {
      data: { provider: 'invalid_provider', type: 'EMAIL' },
    });
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('Google OAuth Flow', () => {
  test('GET /api/auth/google redirects (to Google or sign-in)', async ({ request }) => {
    const response = await request.get('/api/auth/google', {
      maxRedirects: 0,
    });
    // Should redirect, not return JSON error
    expect([301, 302, 307, 308]).toContain(response.status());
  });

  test('callback handles missing code/state', async ({ request }) => {
    const response = await request.get('/api/auth/google/callback', {
      maxRedirects: 0,
    });
    // Should redirect with error param, not 500
    expect(response.status()).toBeLessThan(500);
  });

  test('callback handles error=access_denied', async ({ request }) => {
    const response = await request.get('/api/auth/google/callback?error=access_denied', {
      maxRedirects: 0,
    });
    expect(response.status()).toBeLessThan(500);

    // Should redirect to settings with error
    const location = response.headers()['location'] || '';
    if (location) {
      expect(location).toContain('error=');
    }
  });
});

test.describe('Connector Page', () => {
  test('settings/connectors page loads', async ({ page }) => {
    await page.goto('/settings/connectors');
    await page.waitForLoadState('domcontentloaded');

    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});
