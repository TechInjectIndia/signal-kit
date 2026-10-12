import { test, expect } from '@playwright/test';
test('real SSR/hydration, SPA pages, consent, API observation and Kit internal-fetch correlation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Allow analytics and observability' }),
  ).toBeEnabled();
  await expect(page.locator('#records')).toHaveText('[]');
  await page.getByRole('button', { name: 'Allow analytics and observability' }).click();
  await expect(page.locator('#records')).toContainText('page_view');
  await page.getByRole('link', { name: 'Catalog', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Catalog', exact: true })).toBeVisible();
  await expect(page.locator('#records')).toContainText('"page_path": "/catalog"');
  await page.getByRole('button', { name: 'Add demo cart event' }).click();
  await expect(page.locator('#records')).toContainText('add_to_cart');
  await page.getByRole('button', { name: 'Call API' }).click();
  await expect(page.locator('#records')).toContainText('"route": "/api/ping"');
  const browserRecords = JSON.parse(await page.locator('#records').innerText());
  expect(
    browserRecords
      .filter((r: { name: string }) => r.name === 'page_view')
      .map((r: { properties: { page_path: string } }) => r.properties.page_path),
  ).toEqual(['/', '/catalog']);
  const api = await page.request.get('/api/ping');
  expect(api.status()).toBe(200);
  expect(await api.json()).toEqual({ ok: true });
  const records = await (await page.request.get('/api/records')).json();
  const incoming = records
    .filter((r: { route: string; spanKind: number }) => r.route === '/api/ping' && r.spanKind === 2)
    .at(-1);
  const outgoing = records.find(
    (r: { route: string; spanKind: number; traceId: string }) =>
      r.route === '/api/upstream' && r.spanKind === 3 && r.traceId === incoming.traceId,
  );
  expect(outgoing).toBeTruthy();
  await page.getByRole('button', { name: 'Withdraw consent' }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const after = JSON.parse(await page.locator('#records').innerText());
  expect(after.filter((r: { name: string }) => r.name === 'page_view')).toHaveLength(2);
});
