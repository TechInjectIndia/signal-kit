import { it, expect } from 'vitest';
import { createServerSignals } from '@signalkit/server';
import { instrumentBunFetch } from '../src/index.js';
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
