import { test, expect } from '@playwright/test';

/**
 * Smoke Tests - All Pages Load
 * Verify main pages load without 500 errors or crashes.
 */

const PAGES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/chat', name: 'Chat' },
  { path: '/meetings', name: 'Meetings' },
  { path: '/stakeholders', name: 'People' },
  { path: '/goals', name: 'Goals' },
  { path: '/kpis', name: 'KPIs' },
  { path: '/coaching', name: 'Coaching' },
  { path: '/wins', name: 'Wins' },
  { path: '/settings', name: 'Settings' },
  { path: '/settings/connectors', name: 'Connectors' },
  { path: '/onboarding', name: 'Onboarding' },
];

test.describe('Smoke Tests - Page Load', () => {
  for (const { path, name } of PAGES) {
    test(`${name} page loads (${path})`, async ({ page }) => {
      const jsErrors: string[] = [];

      page.on('pageerror', (error) => {
        jsErrors.push(error.message);
      });

      const response = await page.goto(path);
      await page.waitForLoadState('domcontentloaded');

      // Should not return 500
      const status = response?.status();
      expect(status).toBeDefined();
      expect(status).toBeLessThan(500);

      // Body should have content
      await expect(page.locator('body')).not.toBeEmpty();

      // No unhandled JS errors (exclude hydration warnings)
      const criticalErrors = jsErrors.filter(e =>
        !e.includes('hydration') &&
        !e.includes('Minified React error')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }
});

test.describe('Smoke Tests - Navigation', () => {
  test('sidebar has correct nav links', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Desktop sidebar should have navigation links
    const sidebar = page.locator('aside, [class*="sidebar"]').first();

    const expectedLinks = ['/dashboard', '/chat', '/meetings', '/stakeholders', '/settings'];
    for (const href of expectedLinks) {
      const link = sidebar.locator(`a[href="${href}"]`);
      // Link should exist (may be hidden on mobile)
      expect(await link.count()).toBeGreaterThan(0);
    }
  });

  test('sign out button exists', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Should have a sign out button somewhere
    const signOutBtn = page.locator('button[title="Sign out"], button:has-text("Sign out")');
    expect(await signOutBtn.count()).toBeGreaterThan(0);
  });
});

test.describe('Smoke Tests - API Health', () => {
  const API_ROUTES = [
    '/api/user/profile',
    '/api/connectors',
    '/api/today',
  ];

  for (const route of API_ROUTES) {
    test(`API ${route} responds`, async ({ request }) => {
      const response = await request.get(route);
      // Should not 500 (401 is fine — means auth works)
      expect(response.status()).toBeLessThan(500);
    });
  }
});
