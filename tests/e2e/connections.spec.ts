import { test, expect } from '@playwright/test';

test('connections page follows real consent and SDK outcomes on mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connections' }).click();
  const dashboard = page.getByRole('region', { name: 'SignalKit connections' });
  await expect(dashboard.getByRole('article')).toHaveCount(2);
  await expect(dashboard).toContainText('Blocked by consent');
  await page.getByLabel('analytics', { exact: true }).check();
  await page.getByRole('button', { name: 'Track this page' }).click();
  await expect(dashboard).toContainText('SDK send completed');
  await page.getByLabel('analytics', { exact: true }).uncheck();
  await expect(dashboard.getByRole('article').first()).toContainText('Blocked by consent');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/connections-mobile.png', fullPage: true });
});
