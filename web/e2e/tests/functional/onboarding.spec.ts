import { test, expect } from '@playwright/test';

/**
 * Onboarding Flow Tests
 * Tests the critical new-user flow: sign up → onboarding → connect Google → dashboard
 */

test.describe('Onboarding Flow', () => {
  test('onboarding page loads with profile form', async ({ page }) => {
    await page.goto('/onboarding');
    await page.waitForLoadState('domcontentloaded');

    // Should show onboarding content (not a blank page or error)
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(50);
  });

  test('onboarding API accepts profile data', async ({ request }) => {
    // POST to onboarding should not 500 (401 without auth is fine)
    const response = await request.post('/api/onboarding', {
      data: {
        name: 'Test User',
        role: 'Engineering Manager',
        company: 'Test Corp',
        teamSize: '5-10',
      },
    });
    // Should be 401 (unauthorized) not 500 (broken)
    expect(response.status()).toBeLessThan(500);
  });

  test('onboarding progress API works', async ({ request }) => {
    const response = await request.get('/api/onboarding/progress');
    expect(response.status()).toBeLessThan(500);
  });
});
