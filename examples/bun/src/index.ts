import { createHmac, timingSafeEqual } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { createGA4MeasurementProtocolProvider, createServerSignals } from '@techinject/server';
import { instrumentBunFetch } from '@techinject/bun';
import type { Provider, RegisteredEventInput } from '@techinject/contracts';

import { exampleEvents } from './events.js';
type EventInput = RegisteredEventInput<typeof exampleEvents>;
const records: unknown[] = [];
const append = (value: unknown) => {
  records.push(value);
  if (records.length > 100) records.shift();
};
const database = new Database(process.env.SIGNALKIT_DEMO_DB ?? 'demo.sqlite', { create: true });
database.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, currency TEXT NOT NULL, paid INTEGER NOT NULL DEFAULT 0, marketing_consent INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS outbox (order_id TEXT PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);`);
// Additive migrations for databases created by an earlier version of this lab.
function addColumn(table: string, column: string, definition: string) {
  const columns = database.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column))
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
// Per-order consent snapshot and vendor identifiers, captured by the host at checkout.
addColumn('orders', 'analytics_consent', 'INTEGER NOT NULL DEFAULT 0');
addColumn('orders', 'ga4_client_id', 'TEXT');
addColumn('orders', 'ga4_session_id', 'TEXT');
addColumn('orders', 'event_source_url', 'TEXT');
// Paid-at is written once, in the same transaction as the paid-state update, and reused by every retry.
addColumn('orders', 'paid_at', 'INTEGER');
addColumn('outbox', 'paid_at', 'INTEGER');
addColumn('outbox', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
// Parked rows (dropped/invalid) need a person; they are never retried automatically.
addColumn('outbox', 'flagged', 'INTEGER NOT NULL DEFAULT 0');
// Per-provider delivery state (JSON: provider name -> 'sent' | 'skipped:<reason>' | 'denied'), so a
// retry targets only the providers that are not done yet and never re-sends a copy that succeeded.
addColumn('outbox', 'providers_done', `TEXT NOT NULL DEFAULT '{}'`);
// Why a row was flagged (attempt cap or a parked outcome), for the person who picks it up.
addColumn('outbox', 'flag_reason', 'TEXT');
// Synthetic host-owned order. Real hosts load their trusted order record and consent.
database
  .query(
    'INSERT OR IGNORE INTO orders(id,amount,currency,marketing_consent,analytics_consent,ga4_client_id,ga4_session_id,event_source_url) VALUES(?,?,?,?,?,?,?,?)',
  )
  .run(
    'order_demo',
    45000,
    'INR',
    1,
    1,
    'synthetic.1000000001',
    '1700000000',
    'https://shop.example.test/thank-you',
  );
// Optional GA4 Measurement Protocol. Host configuration only; nothing is enabled without both values.
// GA4_MP_ENDPOINT lets fixtures point at a local collector. Never commit a real API secret.
const ga4MeasurementId = process.env.GA4_MEASUREMENT_ID;
const ga4ApiSecret = process.env.GA4_API_SECRET;
// The recorder's category is configurable for fixtures so a test can put it in the same category as
// GA4 MP and prove that retries target provider names, not categories.
const recorderCategory: Provider['category'] =
  process.env.SIGNALKIT_RECORDER_CATEGORY === 'analytics' ? 'analytics' : 'marketing';
const providers: Provider[] = [
  {
    name: 'local-recorder',
    category: recorderCategory,
    send(event) {
      append(event);
    },
  },
];
if (ga4MeasurementId && ga4ApiSecret)
  providers.push(
    createGA4MeasurementProtocolProvider({
      measurementId: ga4MeasurementId,
      apiSecret: ga4ApiSecret,
      ...(process.env.GA4_MP_ENDPOINT ? { endpoint: process.env.GA4_MP_ENDPOINT } : {}),
    }),
  );
const signals = createServerSignals({
  events: exampleEvents,
  consent: { analytics: false, marketing: false, observability: true },
  providers,
  observer: {
    record(record) {
      append(record);
    },
  },
  onDiagnostic(result) {
    append(result);
  },
});
// Retry cap: a permanently failing provider must not be retried forever. Configurable for fixtures.
const maxAttempts = Number(process.env.SIGNALKIT_MAX_ATTEMPTS ?? 8);
type OutboxRow = {
  order_id: string;
  payload: string;
  providers_done: string;
  attempts: number;
  paid_at: number | null;
  analytics_consent: number;
  marketing_consent: number;
  ga4_client_id: string | null;
  ga4_session_id: string | null;
  event_source_url: string | null;
};
let draining: Promise<void> | undefined;
function drain() {
  if (draining) return draining;
  draining = (async () => {
    // Recheck durable host consent at dispatch; a queued purchase is not permission forever.
    database
      .query(
        'DELETE FROM outbox WHERE sent=0 AND order_id IN (SELECT id FROM orders WHERE marketing_consent=0 AND analytics_consent=0)',
      )
      .run();
    const rows = database
      .query(
        `SELECT outbox.order_id,outbox.payload,outbox.providers_done,outbox.attempts,outbox.paid_at,orders.analytics_consent,orders.marketing_consent,orders.ga4_client_id,orders.ga4_session_id,orders.event_source_url
         FROM outbox JOIN orders ON orders.id=outbox.order_id
         WHERE outbox.sent=0 AND outbox.flagged=0`,
      )
      .all() as OutboxRow[];
    for (const row of rows) {
      // Re-read at dispatch: consent can change between the SELECT and this row's turn.
      const current = database
        .query('SELECT analytics_consent,marketing_consent FROM orders WHERE id=?')
        .get(row.order_id) as { analytics_consent: number; marketing_consent: number } | null;
      if (!current?.analytics_consent && !current?.marketing_consent) {
        database.query('DELETE FROM outbox WHERE order_id=? AND sent=0').run(row.order_id);
        continue;
      }
      const input = JSON.parse(row.payload) as EventInput;
      // Business time of the payment, not the drain time: retries and replays keep the same value.
      if (row.paid_at !== null) input.timestamp = row.paid_at;
      const done = JSON.parse(row.providers_done) as Record<string, string>;
      // GA4 MP throws without a client_id, which would retry forever. Check first and record a skip.
      if (!done['ga4-mp'] && providers.some((p) => p.name === 'ga4-mp') && !row.ga4_client_id)
        done['ga4-mp'] = 'skipped:missing_ga4_client_id';
      // Target only providers that are not done yet, by name. Category targeting would re-send to a
      // provider that already succeeded whenever it shares a category with a pending one.
      const pending = providers.filter((p) => !done[p.name]);
      let flagReason: string | undefined;
      if (pending.length) {
        const result = await signals.track(input, {
          // The order's stored consent, not instance consent.
          consent: {
            analytics: current.analytics_consent === 1,
            marketing: current.marketing_consent === 1,
            observability: true,
          },
          providers: pending.map((p) => p.name),
          context: {
            ...(row.ga4_client_id
              ? {
                  ga4: {
                    clientId: row.ga4_client_id,
                    ...(row.ga4_session_id ? { sessionId: row.ga4_session_id } : {}),
                  },
                }
              : {}),
            ...(row.event_source_url ? { meta: { eventSourceUrl: row.event_source_url } } : {}),
          },
        });
        for (const o of result.outcomes) {
          // sent, skipped (no mapping) and denied (consent no longer granted) are terminal for that provider.
          // not_targeted only means this call aimed at other providers; it says nothing about delivery.
          if (o.reason === 'not_targeted' || done[o.provider]) continue;
          if (o.status === 'sent' || o.status === 'denied') done[o.provider] = o.status;
          else if (o.status === 'skipped') done[o.provider] = `skipped:${o.reason ?? 'skipped'}`;
          else if (o.status === 'dropped' || o.status === 'invalid')
            flagReason = `${o.provider}:${o.status}`;
        }
      }
      const complete = providers.every((p) => done[p.name]);
      const attempts = row.attempts + 1;
      if (!flagReason && !complete && attempts >= maxAttempts) flagReason = 'max_attempts_reached';
      database
        .query(
          'UPDATE outbox SET providers_done=?,sent=?,flagged=?,flag_reason=?,attempts=attempts+? WHERE order_id=?',
        )
        .run(
          JSON.stringify(done),
          complete && !flagReason ? 1 : 0,
          flagReason ? 1 : 0,
          flagReason ?? null,
          complete ? 0 : 1,
          row.order_id,
        );
    }
  })().finally(() => {
    draining = undefined;
  });
  return draining;
}
const capture = database.transaction(
  (payment: { order_id: string; amount: number; currency: string }) => {
    const order = database
      .query('SELECT amount,currency,marketing_consent,analytics_consent FROM orders WHERE id=?')
      .get(payment.order_id) as {
      amount: number;
      currency: string;
      marketing_consent: number;
      analytics_consent: number;
    } | null;
    if (!order || order.amount !== payment.amount || order.currency !== payment.currency)
      throw new Error('Order mismatch');
    // COALESCE keeps the first capture time when the webhook is replayed.
    database
      .query('UPDATE orders SET paid=1,paid_at=COALESCE(paid_at,?) WHERE id=?')
      .run(Date.now(), payment.order_id);
    const paid = database.query('SELECT paid_at FROM orders WHERE id=?').get(payment.order_id) as {
      paid_at: number;
    };
    if (!order.marketing_consent && !order.analytics_consent) return;
    const input: EventInput = {
      name: 'purchase',
      eventId: `purchase.${payment.order_id}`,
      properties: {
        transaction_id: payment.order_id,
        value: order.amount / 100,
        currency: order.currency,
        items: [{ item_id: 'notebook', item_name: 'Field notebook', price: 450, quantity: 1 }],
      },
    };
    database
      .query('INSERT OR IGNORE INTO outbox(order_id,event_id,payload,paid_at) VALUES(?,?,?,?)')
      .run(payment.order_id, input.eventId!, JSON.stringify(input), paid.paid_at);
  },
);
async function readBounded(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        throw new Error('too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
const fetchHandler = instrumentBunFetch(
  signals,
  async (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/health') return Response.json({ ok: true });
    if (path === '/debug/records') return Response.json(records);
    if (path === '/api/orders/order_demo')
      return Response.json({
        id: 'order_demo',
        value: 450,
        currency: 'INR',
        eventId: 'purchase.order_demo',
      });
    if (path === '/webhooks/razorpay' && request.method === 'POST') {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret)
        return Response.json(
          { error: 'Set RAZORPAY_WEBHOOK_SECRET to use this local fixture' },
          { status: 503 },
        );
      let raw: Buffer;
      try {
        raw = await readBounded(request);
      } catch {
        return new Response('Payload too large', { status: 413 });
      }
      const signature = request.headers.get('x-razorpay-signature') ?? '';
      if (!/^[a-f0-9]{64}$/i.test(signature))
        return new Response('Invalid signature', { status: 401 });
      const digest = createHmac('sha256', secret).update(raw).digest();
      if (!timingSafeEqual(digest, Buffer.from(signature, 'hex')))
        return new Response('Invalid signature', { status: 401 });
      let payload: any;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        return new Response('Invalid JSON', { status: 400 });
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return new Response('Invalid event', { status: 400 });
      if (payload.event !== 'payment.captured') return Response.json({ ignored: true });
      const payment = payload.payload?.payment?.entity;
      if (
        payment?.status !== 'captured' ||
        payment.captured !== true ||
        typeof payment.order_id !== 'string' ||
        !Number.isSafeInteger(payment.amount) ||
        typeof payment.currency !== 'string'
      )
        return new Response('Invalid captured payment', { status: 400 });
      try {
        capture(payment);
      } catch {
        return new Response('Order mismatch', { status: 409 });
      }
      await drain();
      return Response.json({ ok: true, eventId: `purchase.${payment.order_id}` });
    }
    return new Response('Not found', { status: 404 });
  },
  (request) =>
    new URL(request.url).pathname.startsWith('/api/orders/') ? '/api/orders/:id' : undefined,
);
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 3200),
  fetch: fetchHandler,
});
void drain();
console.log(`SignalKit Bun lab http://127.0.0.1:${server.port}`);
process.on('SIGTERM', () => {
  server.stop(true);
  signals.dispose();
  database.close();
  process.exit(0);
});
