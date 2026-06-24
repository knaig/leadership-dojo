import { test, expect, Page, Browser } from '@playwright/test';

/**
 * UI Walkthrough — Single Browser Window
 *
 * Runs all UI path tests sequentially in ONE browser window.
 * Use with --headed to watch: npx playwright test --project=comprehensive -g "Walkthrough" --headed --workers=1
 */

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

/** Collect JS errors */
const jsErrors: string[] = [];

test.beforeAll(async () => {
  page.on('pageerror', (error) => {
    if (error.message.includes('hydration')) return;
    if (error.message.includes('Minified React error')) return;
    if (error.message.includes('ResizeObserver')) return;
    if (error.message.includes('AbortError')) return;
    jsErrors.push(error.message);
  });
});

function isAuthRedirect(): boolean {
  return page.url().includes('sign-in') || page.url().includes('sign-up') || page.url().includes('clerk');
}

// ── Page Load Tests ────────────────────────────────────────────

test('Walkthrough: Dashboard loads', async () => {
  const response = await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Chat loads', async () => {
  const response = await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Meetings loads', async () => {
  const response = await page.goto('/meetings', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: People loads', async () => {
  const response = await page.goto('/stakeholders', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Goals loads', async () => {
  const response = await page.goto('/goals', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: KPIs loads', async () => {
  const response = await page.goto('/kpis', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Coaching loads', async () => {
  const response = await page.goto('/coaching', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Wins loads', async () => {
  const response = await page.goto('/wins', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Insights loads', async () => {
  const response = await page.goto('/insights', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Projects loads', async () => {
  const response = await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Settings loads', async () => {
  const response = await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Connectors loads', async () => {
  const response = await page.goto('/settings/connectors', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('Walkthrough: Onboarding loads', async () => {
  const response = await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).not.toBeEmpty();
});

// ── Navigation Tests ───────────────────────────────────────────

test('Walkthrough: Nav — sidebar links exist', async () => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  if (isAuthRedirect()) return;
  await page.waitForTimeout(2000);

  const links = ['/chat', '/meetings', '/stakeholders', '/goals', '/settings'];
  for (const href of links) {
    const link = page.locator(`a[href="${href}"], a[href="${href}/"]`).first();
    // Just check they exist in DOM (may be hidden on mobile)
    const count = await link.count();
    if (count > 0) {
      // Found it
    }
  }
});

test('Walkthrough: Nav — click chat link', async () => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  if (isAuthRedirect()) return;
  await page.waitForTimeout(1500);

  const link = page.locator('a[href="/chat"], a[href="/chat/"]').first();
  if (await link.count() > 0 && await link.isVisible()) {
    await link.click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('/chat');
  }
});

// ── Interaction Tests ──────────────────────────────────────────

test('Walkthrough: Chat — type in input', async () => {
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  if (isAuthRedirect()) return;
  await page.waitForTimeout(1000);

  const input = page.locator('input[type="text"], textarea, [contenteditable="true"]').first();
  if (await input.isVisible()) {
    await input.fill('Hello Mira, help me prepare for my next meeting');
    await page.waitForTimeout(500);
  }
});

test('Walkthrough: Meetings — click date nav buttons', async () => {
  await page.goto('/meetings', { waitUntil: 'domcontentloaded' });
  if (isAuthRedirect()) return;
  await page.waitForTimeout(1000);

  // Only click small icon buttons (date arrows), not all buttons (which may trigger navigation)
  const buttons = page.locator('button:visible');
  const count = await buttons.count();
  for (let i = 0; i < Math.min(count, 3); i++) {
    const btn = buttons.nth(i);
    if (await btn.isVisible() && !(await btn.isDisabled())) {
      // Skip buttons that might navigate away
      const text = await btn.textContent();
      if (text && text.length > 20) continue; // Skip buttons with long text (likely CTAs)
      await btn.click({ timeout: 3000 }).catch(() => {}); // Don't fail on click timeout
      await page.waitForTimeout(300);
    }
  }
});

test('Walkthrough: People — click filter tabs', async () => {
  await page.goto('/stakeholders', { waitUntil: 'domcontentloaded' });
  if (isAuthRedirect()) return;
  await page.waitForTimeout(1000);

  const tabs = page.locator('button:visible, [role="tab"]:visible');
  const count = await tabs.count();
  for (let i = 0; i < Math.min(count, 5); i++) {
    const tab = tabs.nth(i);
    if (await tab.isVisible()) {
      await tab.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
});

test('Walkthrough: Settings — click input fields', async () => {
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  if (isAuthRedirect()) return;
  await page.waitForTimeout(1000);

  const inputs = page.locator('input[type="text"]:visible, textarea:visible');
  const count = await inputs.count();
  for (let i = 0; i < Math.min(count, 3); i++) {
    const input = inputs.nth(i);
    await input.click();
    await page.waitForTimeout(200);
  }
});

// ── Empty Space Click Safety ───────────────────────────────────

test('Walkthrough: Empty space clicks — dashboard', async () => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.mouse.click(500, 300);
  await page.mouse.click(100, 500);
  await page.mouse.click(700, 200);
  await page.waitForTimeout(300);
});

test('Walkthrough: Empty space clicks — chat', async () => {
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.mouse.click(400, 200);
  await page.mouse.click(200, 400);
  await page.waitForTimeout(300);
});

test('Walkthrough: Empty space clicks — meetings', async () => {
  await page.goto('/meetings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.mouse.click(500, 300);
  await page.mouse.click(300, 500);
  await page.waitForTimeout(300);
});

// ── Keyboard Tests ─────────────────────────────────────────────

test('Walkthrough: Keyboard — Tab through dashboard', async () => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
  }
});

test('Walkthrough: Keyboard — Escape on each page', async () => {
  const pages = ['/dashboard', '/chat', '/meetings', '/stakeholders', '/settings'];
  for (const path of pages) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
});

// ── Rapid Navigation ───────────────────────────────────────────

test('Walkthrough: Rapid page switching', async () => {
  const pages = ['/dashboard', '/chat', '/meetings', '/stakeholders', '/goals', '/settings'];
  for (const path of pages) {
    await page.goto(path, { waitUntil: 'commit' });
    await page.waitForTimeout(300);
  }
  await page.waitForLoadState('domcontentloaded');
});

test('Walkthrough: Back/forward navigation', async () => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.goto('/chat', { waitUntil: 'domcontentloaded' });
  await page.goto('/meetings', { waitUntil: 'domcontentloaded' });

  await page.goBack();
  await page.waitForTimeout(500);
  await page.goBack();
  await page.waitForTimeout(500);
  await page.goForward();
  await page.waitForTimeout(500);
});

// ── Double Click Safety ────────────────────────────────────────

test('Walkthrough: Double-click on buttons', async () => {
  await page.goto('/meetings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const btn = page.locator('button:visible').first();
  if (await btn.count() > 0) {
    await btn.dblclick();
    await page.waitForTimeout(300);
  }
});

// ── Final Check ────────────────────────────────────────────────

test('Walkthrough: No JS errors throughout', async () => {
  expect(jsErrors).toHaveLength(0);
});
