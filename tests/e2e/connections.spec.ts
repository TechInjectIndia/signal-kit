import { test, expect } from '@playwright/test';

test('connections page follows real consent and SDK outcomes on mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Connections' }).click();
  const dashboard = page.getByRole('region', { name: 'SignalKit connections' });
  const events = dashboard.getByRole('region', { name: 'Event provider connections' });
  const observability = dashboard.getByRole('region', { name: 'Observability connections' });
  await expect(observability.getByRole('article')).toHaveCount(3);
  for (const backend of ['Sentry', 'Grafana', 'SigNoz']) {
    const card = observability
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: backend, exact: true }) });
    await expect(card).toContainText('Not configured');
  }

  await expect(events.getByRole('article')).toHaveCount(2);
  await expect(events).toContainText('Blocked by consent');
  await page.getByLabel('analytics', { exact: true }).check();
  await page.getByRole('button', { name: 'Track this page' }).click();
  await expect(events).toContainText('SDK send completed');
  await expect(observability.getByText('Not configured', { exact: true })).toHaveCount(3);
  await page.getByLabel('analytics', { exact: true }).uncheck();
  await expect(events.getByRole('article').first()).toContainText('Blocked by consent');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/connections-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'SignalKit lab home' }).click();
  await expect(dashboard).toHaveCount(0);
  await page.getByRole('link', { name: 'Connections' }).click();
  await expect(events.getByRole('article').first()).toContainText('1 completed');
});
