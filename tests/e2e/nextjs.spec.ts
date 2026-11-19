import { test, expect } from '@playwright/test';
test('consent, navigation, commerce and automatic API capture', async ({ page }) => {
  await page.route(/googletagmanager\.com\/gtag\/js|fbevents\.js|clarity\.ms\/tag\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('SDK ready · fake public provider IDs');
  await expect(page.getByRole('list', { name: 'Recorded activity' })).toContainText(
    'local-analytics: denied',
  );
  await page.getByLabel('analytics', { exact: true }).check();
  await page.getByLabel('marketing', { exact: true }).check();
  await page.getByLabel('observability', { exact: true }).check();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('link', { name: 'Open the sample store' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  const feed = page.getByRole('list', { name: 'Recorded activity' });
  await expect(feed).toContainText('page_view');
  await expect(feed.locator('li').filter({ hasText: /^page_view/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(feed).toContainText('add_to_cart');
  for (const provider of ['ga4', 'meta-pixel', 'clarity']) {
    await expect(feed).toContainText(`${provider}: sent`);
  }
  for (const [button, event] of [
    ['Track phone contact', 'phone_click'],
    ['Track WhatsApp contact', 'whatsapp_click'],
    ['Track help opened', 'custom_event'],
  ]) {
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(feed).toContainText(event);
    for (const provider of ['ga4', 'meta-pixel', 'clarity']) {
      await expect(feed).toContainText(`${provider}: sent`);
    }
  }
  await page.getByRole('button', { name: 'Test API' }).click();
  await expect(feed).toContainText('GET /api/ping · 200');
  await page.getByLabel('analytics', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('link', { name: 'Back to the lab' }).click();
  await expect(feed).toContainText('local-analytics: denied');
  await expect(feed.locator('li').filter({ hasText: /^page_view/ })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Every signal.' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/next-demo-mobile.png', fullPage: true });
});
test('landing source survives the router and persists only under marketing consent', async ({
  page,
}) => {
  await page.goto('/?utm_source=bing&utm_medium=cpc&utm_term=field%20notebook&msclkid=m1');
  const source = page.getByRole('region', { name: 'Visit source' }).or(page.locator('.source'));
  // Marketing consent pending: the landing touch is held in memory only and is not exposed.
  await expect(source).toContainText('direct or not captured');
  expect(await page.evaluate(() => localStorage.getItem('signalkit.attribution'))).toBeNull();
  await page.getByLabel('marketing', { exact: true }).check();
  await expect(source).toContainText('paid_search · bing / cpc · “field notebook”');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('signalkit.attribution')))
    .toContain('paid_search');
  await page.getByRole('link', { name: 'Open the sample store' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(source).toContainText('bing / cpc');
  await page.getByLabel('marketing', { exact: true }).uncheck();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('signalkit.attribution')))
    .toBeNull();
  const terms = await page.request.get('/api/search-terms');
  expect(await terms.json()).toEqual({ configured: false, rows: [] });
});
test('attribution self-check reports a clean landing and a tainted canonical link', async ({
  page,
}) => {
  await page.goto('/?gclid=test');
  await expect(page.getByRole('status')).toHaveText('SDK ready · fake public provider IDs');
  await page.getByRole('button', { name: 'Audit attribution' }).click();
  const audit = page.getByRole('region', { name: 'Attribution audit' });
  await expect(audit).toBeVisible();
  await expect(audit.locator('li[data-severity="error"]')).toHaveCount(0);
  await expect(audit).toContainText('consent-never-granted');
  await page.getByLabel('marketing', { exact: true }).check();
  await page.getByRole('button', { name: 'Audit attribution' }).click();
  await expect(audit).toContainText('no findings');
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = '/?utm_source=x';
      document.head.append(link);
    });
  });
  await page.goto('/?gclid=test');
  await expect(page.getByRole('status')).toHaveText('SDK ready · fake public provider IDs');
  await page.getByRole('button', { name: 'Audit attribution' }).click();
  await expect(audit.locator('li[data-severity="error"]')).toContainText(
    'canonical-has-tracking-params',
  );
});
test('delayed consent sends one GA4 page_view, then one Meta PageView, with no double count', async ({
  page,
}) => {
  await page.route(/googletagmanager\.com\/gtag\/js|fbevents\.js|clarity\.ms\/tag\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await page.goto('/?gclid=test');
  await expect(page.getByRole('status')).toHaveText('SDK ready · fake public provider IDs');
  // Provider stubs record commands: gtag pushes Arguments objects to dataLayer, fbq queues arrays.
  const ga4PageViews = () =>
    page.evaluate(
      () =>
        ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).filter(
          (entry) => entry[0] === 'event' && entry[1] === 'page_view',
        ).length,
    );
  const pixelPageViews = () =>
    page.evaluate(
      () =>
        ((window as unknown as { fbq?: { queue?: unknown[][] } }).fbq?.queue ?? []).filter(
          (entry) => entry[2] === 'PageView',
        ).length,
    );
  // Denied landing: nothing was sent, and nothing is queued for replay.
  expect(await ga4PageViews()).toBe(0);
  expect(await pixelPageViews()).toBe(0);
  await page.getByLabel('analytics', { exact: true }).check();
  await expect.poll(ga4PageViews).toBe(1);
  expect(await pixelPageViews()).toBe(0);
  await page.getByLabel('marketing', { exact: true }).check();
  await expect.poll(pixelPageViews).toBe(1);
  // Marketing grant must not repeat the GA4 page_view.
  await page.waitForTimeout(500);
  expect(await ga4PageViews()).toBe(1);
  expect(await pixelPageViews()).toBe(1);
});
