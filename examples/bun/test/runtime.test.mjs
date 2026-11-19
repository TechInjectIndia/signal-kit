import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

test('real Bun incoming spans + verified durable webhook replay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'signalkit-'));
  const secret = 'local-synthetic-fixture';
  const db = join(dir, 'demo.sqlite');
  // Local stand-in for the GA4 collector: records the envelopes the example sends. Synthetic secret.
  const collected = [];
  const collector = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      collected.push(JSON.parse(body));
      res.statusCode = 204;
      res.end();
    });
  });
  await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
  const sql = (statement) =>
    spawnSync(
      'bun',
      [
        '-e',
        `import {Database} from 'bun:sqlite'; const db=new Database(process.env.SIGNALKIT_DEMO_DB); console.log(JSON.stringify(db.query(process.env.SQL).all())); db.close();`,
      ],
      { env: { ...process.env, SIGNALKIT_DEMO_DB: db, SQL: statement }, encoding: 'utf8' },
    );
  let child;
  async function start() {
    child = spawn('bun', ['run', 'src/index.ts'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        PORT: '0',
        SIGNALKIT_DEMO_DB: db,
        RAZORPAY_WEBHOOK_SECRET: secret,
        GA4_MEASUREMENT_ID: 'G-EXAMPLE000',
        GA4_API_SECRET: 'synthetic-api-secret',
        GA4_MP_ENDPOINT: `http://127.0.0.1:${collector.address().port}/mp/collect`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(
        () => reject(new Error('Bun startup timed out: ' + output)),
        10000,
      );
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[0]);
        }
      });
      child.stderr.on('data', (chunk) => (output += chunk));
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error('Bun exited ' + code + ': ' + output));
      });
    });
  }
  async function stop() {
    if (child?.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  }
  try {
    let url = await start();
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            status: 'captured',
            captured: true,
            order_id: 'order_demo',
            amount: 45000,
            currency: 'INR',
          },
        },
      },
    });
    const headers = {
      'content-type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', secret).update(raw).digest('hex'),
    };
    assert.equal(
      (await fetch(url + '/webhooks/razorpay', { method: 'POST', body: raw })).status,
      401,
    );
    const signed = (body) => ({
      'content-type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', secret).update(body).digest('hex'),
    });
    assert.equal(
      (
        await fetch(url + '/webhooks/razorpay', {
          method: 'POST',
          body: 'null',
          headers: signed('null'),
        })
      ).status,
      400,
    );
    const mismatch = raw.replace('45000', '999');
    assert.equal(
      (
        await fetch(url + '/webhooks/razorpay', {
          method: 'POST',
          body: mismatch,
          headers: signed(mismatch),
        })
      ).status,
      409,
    );
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await fetch(url + '/webhooks/razorpay', { method: 'POST', body: raw, headers })).status,
        200,
      );
    const records = await (await fetch(url + '/debug/records')).json();
    assert.equal(records.filter((r) => r.name === 'purchase').length, 1);
    assert.ok(
      records.some(
        (r) => r.kind === 'request' && r.route === '/webhooks/razorpay' && r.status === 200,
      ),
    );
    await stop();
    url = await start();
    assert.equal(
      (await fetch(url + '/webhooks/razorpay', { method: 'POST', body: raw, headers })).status,
      200,
    );
    const fresh = await (await fetch(url + '/debug/records')).json();
    assert.equal(fresh.filter((r) => r.name === 'purchase').length, 0);
    // Paid-at is persisted once and replayed: GA4 and the recorder see the stored value, not drain time.
    const [{ paid_at: paidAt }] = JSON.parse(sql('SELECT paid_at FROM orders').stdout);
    assert.ok(Number.isSafeInteger(paidAt));
    const first = records.find((r) => r.name === 'purchase');
    assert.equal(first.timestamp, paidAt);
    assert.equal(first.eventId, 'purchase.order_demo');
    assert.equal(collected.length, 1);
    assert.equal(collected[0].client_id, 'synthetic.1000000001');
    assert.equal(collected[0].timestamp_micros, paidAt * 1000);
    assert.equal(collected[0].events[0].name, 'purchase');
    await stop();
    assert.equal(sql("UPDATE outbox SET sent=0,providers_done='{}' RETURNING 1 AS n").status, 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    url = await start();
    let replayed = [];
    for (let i = 0; i < 50 && !replayed.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      replayed = (await (await fetch(url + '/debug/records')).json()).filter(
        (r) => r.name === 'purchase',
      );
    }
    assert.equal(replayed.length, 1);
    assert.equal(replayed[0].eventId, 'purchase.order_demo');
    assert.equal(replayed[0].timestamp, paidAt);
    assert.ok(Date.now() > paidAt);
    assert.equal(collected.length, 2);
    assert.equal(collected[1].timestamp_micros, paidAt * 1000);
    for (let i = 0; i < 50 && JSON.parse(sql('SELECT sent FROM outbox').stdout)[0].sent !== 1; i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(JSON.parse(sql('SELECT sent FROM outbox').stdout)[0].sent, 1);
    assert.equal(
      JSON.parse(sql('SELECT paid_at FROM orders').stdout)[0].paid_at,
      paidAt,
      'webhook replay must not move paid_at',
    );
    await stop();
    // Simulate an unsent durable outbox followed by host consent withdrawal before restart.
    const update = spawnSync(
      'bun',
      [
        '-e',
        "import {Database} from 'bun:sqlite'; const db=new Database(process.env.SIGNALKIT_DEMO_DB); db.exec('UPDATE outbox SET sent=0; UPDATE orders SET marketing_consent=0, analytics_consent=0;'); db.close();",
      ],
      { env: { ...process.env, SIGNALKIT_DEMO_DB: join(dir, 'demo.sqlite') }, encoding: 'utf8' },
    );
    assert.equal(update.status, 0, update.stderr);
    url = await start();
    assert.equal(
      (await fetch(url + '/webhooks/razorpay', { method: 'POST', body: raw, headers })).status,
      200,
    );
    const revoked = await (await fetch(url + '/debug/records')).json();
    assert.equal(revoked.filter((r) => r.name === 'purchase').length, 0);
    const remaining = spawnSync(
      'bun',
      [
        '-e',
        "import {Database} from 'bun:sqlite'; const db=new Database(process.env.SIGNALKIT_DEMO_DB); console.log(db.query('SELECT count(*) AS count FROM outbox WHERE sent=0').get().count); db.close();",
      ],
      { env: { ...process.env, SIGNALKIT_DEMO_DB: join(dir, 'demo.sqlite') }, encoding: 'utf8' },
    );
    assert.equal(remaining.status, 0, remaining.stderr);
    assert.equal(remaining.stdout.trim(), '0');
  } finally {
    await stop();
    await new Promise((resolve) => collector.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

// Outbox retry behaviour: per-provider state, missing client_id, attempt cap.
async function lab(extraEnv = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'signalkit-outbox-'));
  const secret = 'local-synthetic-fixture';
  const db = join(dir, 'demo.sqlite');
  const collector = { status: 204, hits: 0 };
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      collector.hits += 1;
      res.statusCode = collector.status;
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const child = spawn('bun', ['run', 'src/index.ts'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      PORT: '0',
      SIGNALKIT_DEMO_DB: db,
      RAZORPAY_WEBHOOK_SECRET: secret,
      GA4_MEASUREMENT_ID: 'G-EXAMPLE000',
      GA4_API_SECRET: 'synthetic-api-secret',
      GA4_MP_ENDPOINT: `http://127.0.0.1:${server.address().port}/mp/collect`,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Bun startup timed out: ' + output)), 10000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.stderr.on('data', (chunk) => (output += chunk));
  });
  const sql = (statement) => {
    const r = spawnSync(
      'bun',
      [
        '-e',
        `import {Database} from 'bun:sqlite'; const db=new Database(process.env.SIGNALKIT_DEMO_DB); console.log(JSON.stringify(db.query(process.env.SQL).all())); db.close();`,
      ],
      { env: { ...process.env, SIGNALKIT_DEMO_DB: db, SQL: statement }, encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const raw = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          status: 'captured',
          captured: true,
          order_id: 'order_demo',
          amount: 45000,
          currency: 'INR',
        },
      },
    },
  });
  const webhook = async () =>
    (
      await fetch(url + '/webhooks/razorpay', {
        method: 'POST',
        body: raw,
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': createHmac('sha256', secret).update(raw).digest('hex'),
        },
      })
    ).status;
  const purchases = async () =>
    (await (await fetch(url + '/debug/records')).json()).filter((r) => r.name === 'purchase');
  const stop = async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  };
  return { collector, sql, webhook, purchases, stop };
}

test('outbox: order without a GA4 client_id completes in one drain and never calls Measurement Protocol', async () => {
  const l = await lab();
  try {
    l.sql('UPDATE orders SET ga4_client_id=NULL RETURNING 1 AS n');
    assert.equal(await l.webhook(), 200);
    const [row] = l.sql('SELECT sent,flagged,attempts,providers_done FROM outbox');
    assert.equal(row.sent, 1);
    assert.equal(row.flagged, 0);
    assert.equal(row.attempts, 0);
    assert.equal(JSON.parse(row.providers_done)['ga4-mp'], 'skipped:missing_ga4_client_id');
    assert.equal(l.collector.hits, 0);
    assert.equal((await l.purchases()).length, 1);
  } finally {
    await l.stop();
  }
});

test('outbox: retry after partial success re-sends only the provider that failed', async () => {
  // Both providers share the analytics category, so only provider-name targeting keeps the
  // already-sent recorder out of the retry.
  const l = await lab({ SIGNALKIT_RECORDER_CATEGORY: 'analytics' });
  try {
    l.collector.status = 500;
    assert.equal(await l.webhook(), 200);
    let [row] = l.sql('SELECT sent,flagged,attempts,providers_done FROM outbox');
    assert.equal(row.sent, 0);
    assert.equal(row.attempts, 1);
    assert.deepEqual(JSON.parse(row.providers_done), { 'local-recorder': 'sent' });
    assert.equal(l.collector.hits, 1);
    l.collector.status = 204;
    assert.equal(await l.webhook(), 200); // replay triggers a drain
    [row] = l.sql('SELECT sent,flagged,providers_done FROM outbox');
    assert.equal(row.sent, 1);
    assert.equal(JSON.parse(row.providers_done)['ga4-mp'], 'sent');
    assert.equal(l.collector.hits, 2, 'only the failed provider was called again');
    assert.equal((await l.purchases()).length, 1, 'the recorder is not re-sent');
  } finally {
    await l.stop();
  }
});

test('outbox: a provider that keeps failing is flagged at the attempt cap and then left alone', async () => {
  const l = await lab({ SIGNALKIT_MAX_ATTEMPTS: '2' });
  try {
    l.collector.status = 500;
    await l.webhook();
    let [row] = l.sql('SELECT flagged,attempts FROM outbox');
    assert.equal(row.flagged, 0);
    await l.webhook();
    [row] = l.sql('SELECT sent,flagged,attempts,flag_reason FROM outbox');
    assert.equal(row.sent, 0);
    assert.equal(row.flagged, 1);
    assert.equal(row.attempts, 2);
    assert.equal(row.flag_reason, 'max_attempts_reached');
    const hits = l.collector.hits;
    await l.webhook();
    assert.equal(l.collector.hits, hits, 'flagged rows are not retried');
  } finally {
    await l.stop();
  }
});
