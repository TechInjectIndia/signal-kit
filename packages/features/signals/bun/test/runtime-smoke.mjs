import { createServerSignals } from '@techinject/server';
import { instrumentBunFetch } from '../dist/index.js';
const records = [];
const signals = createServerSignals({
  consent: { analytics: false, marketing: false, observability: true },
  observer: { record: (record) => records.push(record) },
});
const server = Bun.serve({
  port: 0,
  fetch: instrumentBunFetch(signals, () => new Response('bun-ok')),
});
try {
  const response = await fetch(`http://localhost:${server.port}/orders/42?token=synthetic`, {
    headers: { traceparent: `00-${'1'.repeat(32)}-${'2'.repeat(16)}-01` },
  });
  if ((await response.text()) !== 'bun-ok') throw new Error('Host response changed');
  await signals.flush();
  if (
    records.length !== 1 ||
    records[0].route !== '/orders/:id' ||
    records[0].traceId !== '1'.repeat(32)
  )
    throw new Error('Bun telemetry failed');
  console.log('Bun.serve real runtime: response, safe route and incoming trace passed');
} finally {
  signals.dispose();
  server.stop(true);
}
