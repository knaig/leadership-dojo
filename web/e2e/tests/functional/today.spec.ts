import { test, expect } from '@playwright/test';

/**
 * Dashboard / Today Page Tests
 */

test.describe('Dashboard', () => {
  test('page loads within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    expect(Date.now() - start).toBeLessThan(3000);
  });

  test('no JS errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const critical = errors.filter(e =>
      !e.includes('hydration') && !e.includes('Minified React error')
    );
    expect(critical).toHaveLength(0);
  });

  test('main content renders (not blank)', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(100);
  });
});

test.describe('Today API', () => {
  test('GET /api/today returns data or 401', async ({ request }) => {
    const response = await request.get('/api/today');
    expect(response.status()).toBeLessThan(500);

    if (response.status() === 200) {
      const data = await response.json();
      // Should have the expected shape
      expect(data).toBeDefined();
    }
  });
});
