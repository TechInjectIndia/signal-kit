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
    'docs/nextjs/',
    'docs/bun/',
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
  await page.goto('docs/');
  await expect(page.locator('.platform-card')).toHaveCount(16);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/platform-hub-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/platform-hub-mobile.png', fullPage: true });
  await expect(page.locator('.platform-pending a')).toHaveCount(0);
  await expect(page.locator('.platform-tabs [aria-disabled=true]')).toHaveCount(14);
  await page
    .locator('.platform-card')
    .first()
    .getByRole('link', { name: 'Read integration guide' })
    .click();
  await expect(page).toHaveURL(/docs\/nextjs\//);
  await expect(page.locator('.platform-tabs a[aria-current=page]')).toContainText('Next.js');
  await page.locator('.platform-tabs').getByRole('link', { name: /^Bun/ }).click();
  await expect(page).toHaveURL(/docs\/bun\//);
  await expect(page.locator('.platform-tabs a[aria-current=page]')).toContainText('Bun');
  await page.goto('faq/');
  await expect(page.locator('main')).toContainText(/npm|published/i);
  expect(external).toEqual([]);
});

test.describe('documentation copy enhancement', () => {
  test.use({ javaScriptEnabled: true });
  test('copies only code, supports keyboard and selects code when clipboard fails', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as Window & { copiedCode?: string }).copiedCode = text;
          },
        },
      });
    });
    await page.goto('docs/');
    const figure = page.locator('figure.code').first();
    const button = figure.getByRole('button');
    const expected = await figure.locator('pre code').textContent();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveText('Copied!');
    expect(await page.evaluate(() => (window as Window & { copiedCode?: string }).copiedCode)).toBe(
      expected,
    );
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error('Denied');
      };
    });
    await button.click();
    await expect(figure.getByRole('status')).toContainText('Code selected');
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(expected);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
    await page.goto('guides/bun-api-tracing/');
    await expect(page.locator('[data-copy-code]').first()).toBeVisible();
  });
});
