import { createHmac, timingSafeEqual } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { createServerSignals } from '@signalkit/server';
import { instrumentBunFetch } from '@signalkit/bun';
import type { EventInput } from '@signalkit/contracts';

const records: unknown[] = [];
const append = (value: unknown) => {
  records.push(value);
  if (records.length > 100) records.shift();
};
const database = new Database(process.env.SIGNALKIT_DEMO_DB ?? 'demo.sqlite', { create: true });
database.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, amount INTEGER NOT NULL, currency TEXT NOT NULL, paid INTEGER NOT NULL DEFAULT 0, marketing_consent INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS outbox (order_id TEXT PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);`);
// Synthetic host-owned order. Real hosts load their trusted order record and consent.
database
  .query('INSERT OR IGNORE INTO orders(id,amount,currency,marketing_consent) VALUES(?,?,?,?)')
  .run('order_demo', 45000, 'INR', 1);
const signals = createServerSignals({
  consent: { analytics: true, marketing: true, observability: true },
  providers: [
    {
      name: 'local-recorder',
      category: 'marketing',
      send(event) {
        append(event);
      },
    },
  ],
  observer: {
    record(record) {
      append(record);
    },
  },
  onDiagnostic(result) {
    append(result);
  },
});
let draining: Promise<void> | undefined;
function drain() {
  if (draining) return draining;
  draining = (async () => {
    // Recheck durable host consent at dispatch; a queued purchase is not permission forever.
    database
      .query(
        'DELETE FROM outbox WHERE sent=0 AND order_id IN (SELECT id FROM orders WHERE marketing_consent=0)',
      )
      .run();
    const rows = database
      .query(
        'SELECT outbox.order_id,outbox.payload FROM outbox JOIN orders ON orders.id=outbox.order_id WHERE outbox.sent=0 AND orders.marketing_consent=1',
      )
      .all() as { order_id: string; payload: string }[];
    for (const row of rows) {
      const current = database
        .query('SELECT marketing_consent FROM orders WHERE id=?')
        .get(row.order_id) as { marketing_consent: number } | null;
      if (!current?.marketing_consent) {
        database.query('DELETE FROM outbox WHERE order_id=? AND sent=0').run(row.order_id);
        continue;
      }
      const result = await signals.track(JSON.parse(row.payload) as EventInput);
      if (result.outcomes.length && result.outcomes.every((o) => o.status === 'sent'))
        database.query('UPDATE outbox SET sent=1 WHERE order_id=?').run(row.order_id);
    }
  })().finally(() => {
    draining = undefined;
  });
  return draining;
}
const capture = database.transaction(
  (payment: { order_id: string; amount: number; currency: string }) => {
    const order = database
      .query('SELECT amount,currency,marketing_consent FROM orders WHERE id=?')
      .get(payment.order_id) as {
      amount: number;
      currency: string;
      marketing_consent: number;
    } | null;
    if (!order || order.amount !== payment.amount || order.currency !== payment.currency)
      throw new Error('Order mismatch');
    database.query('UPDATE orders SET paid=1 WHERE id=?').run(payment.order_id);
    if (!order.marketing_consent) return;
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
      .query('INSERT OR IGNORE INTO outbox(order_id,event_id,payload) VALUES(?,?,?)')
      .run(payment.order_id, input.eventId!, JSON.stringify(input));
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
