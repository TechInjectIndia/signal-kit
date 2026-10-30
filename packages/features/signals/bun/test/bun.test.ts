import { it, expect } from 'vitest';
import { createServerSignals } from '@techinject/server';
import { instrumentBunFetch, instrumentBunRoutes } from '../src/index.js';
it('preserves Bun server argument and explicit route template', async () => {
  const records: unknown[] = [];
  const signals = createServerSignals({
    consent: { analytics: false, marketing: false, observability: true },
    observer: {
      record: (r) => {
        records.push(r);
      },
    },
  });
  const server = { fixture: true };
  const handle = instrumentBunFetch(
    signals,
    (_request, received) => {
      expect(received).toBe(server);
      return new Response('host');
    },
    () => '/orders/:id',
  );
  expect(
    await (await handle(new Request('http://localhost/orders/123?token=secret'), server)).text(),
  ).toBe('host');
  expect(records).toEqual([expect.objectContaining({ route: '/orders/:id', status: 200 })]);
});

it('instruments Bun declarative route table handlers (3.3)', async () => {
  const records: unknown[] = [];
  const signals = createServerSignals({
    consent: { analytics: false, marketing: false, observability: true },
    observer: {
      record: (r) => {
        records.push(r);
      },
    },
  });
  const server = { bun: true };
  const rawRoutes = {
    '/api/cart': () => new Response('cart-ok'),
    '/api/checkout': {
      POST: () => new Response('checkout-ok'),
    },
  };
  const wrapped = instrumentBunRoutes(signals, rawRoutes);
  const cartRes = await wrapped['/api/cart'](new Request('http://localhost/api/cart'), server);
  expect(await cartRes.text()).toBe('cart-ok');
  const checkoutRes = await wrapped['/api/checkout'].POST(
    new Request('http://localhost/api/checkout', { method: 'POST' }),
    server,
  );
  expect(await checkoutRes.text()).toBe('checkout-ok');
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({ route: '/api/cart', status: 200 });
  expect(records[1]).toMatchObject({ route: '/api/checkout', status: 200 });
});
