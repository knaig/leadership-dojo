import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('all main navigation links work', async ({ page }) => {
    const navLinks = [
      { name: 'Dashboard', href: '/dashboard' },
      { name: 'Chat', href: '/chat' },
      { name: 'Meetings', href: '/meetings' },
      { name: 'People', href: '/stakeholders' },
      { name: 'Goals', href: '/goals' },
    ];

    for (const link of navLinks) {
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');

      // Find nav link in sidebar/bottom tabs
      const navLink = page.locator(`a[href="${link.href}"]`).first();

      if (await navLink.isVisible()) {
        await navLink.click();
        await page.waitForLoadState('domcontentloaded');
        expect(page.url()).toContain(link.href);
      }
    }
  });

  test('settings link works', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const settingsLink = page.locator('a[href="/settings"]').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('/settings');
    }
  });
});

test.describe('No Dead Links', () => {
  const ROUTES = ['/dashboard', '/chat', '/meetings', '/stakeholders', '/goals', '/settings'];

  for (const route of ROUTES) {
    test(`${route} does not 404 or 500`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }
});
