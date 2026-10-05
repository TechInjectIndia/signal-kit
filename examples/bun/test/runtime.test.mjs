import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

test('real Bun incoming spans + verified durable webhook replay', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'signalkit-'));
  const secret = 'local-synthetic-fixture';
  let child;
  async function start() {
    child = spawn('bun', ['run', 'src/index.ts'], {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        PORT: '0',
        SIGNALKIT_DEMO_DB: join(dir, 'demo.sqlite'),
        RAZORPAY_WEBHOOK_SECRET: secret,
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
    await stop();
    // Simulate an unsent durable outbox followed by host consent withdrawal before restart.
    const update = spawnSync(
      'bun',
      [
        '-e',
        "import {Database} from 'bun:sqlite'; const db=new Database(process.env.SIGNALKIT_DEMO_DB); db.exec('UPDATE outbox SET sent=0; UPDATE orders SET marketing_consent=0;'); db.close();",
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
    await rm(dir, { recursive: true, force: true });
  }
});
