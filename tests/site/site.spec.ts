import { test, expect } from '@playwright/test';
test('public content is crawlable, navigable and responsive without JavaScript', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:3300')) external.push(request.url());
  });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    new URL(process.env.SITE_URL ?? 'https://techinjectindia.github.io/signal-kit/').href.replace(
      /\/?$/,
      '/',
    ),
  );
  await expect(page.locator('meta[name=robots]')).not.toHaveAttribute('content', /noindex/);
  await page.keyboard.press('Tab');
  await expect(page.locator('a').first()).toBeFocused();
  await page.locator('h1').click();
  await page.screenshot({ path: 'test-results/public-site-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/public-site-mobile.png', fullPage: true });
  for (const route of [
    'docs/',
    'integrations/',
    'faq/',
    'guides/',
    'guides/nextjs-purchase-tracking/',
    'guides/meta-pixel-capi-event-ids/',
    'guides/bun-api-tracing/',
  ]) {
    await page.goto(route);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toContainText('SignalKit');
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  }
  await page.goto('faq/');
  await expect(page.locator('main')).toContainText(/npm|published/i);
  expect(external).toEqual([]);
});
