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
