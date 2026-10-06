import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const received = [];
const collector = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    try {
      received.push(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
});
collector.listen(0, '127.0.0.1');
await once(collector, 'listening');
const port = collector.address().port;
const child = spawn(
  'pnpm',
  ['--filter', '@signalkit/example-nextjs', 'exec', 'next', 'start', '--port', '3111'],
  {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {
      ...process.env,
      SIGNALKIT_OTEL_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_BSP_SCHEDULE_DELAY: '100',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const res = await fetch('http://127.0.0.1:3111/');
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await pause(100);
  }
  assert.ok(ready, 'Next startup timed out: ' + output);
  const traceId = '11111111111111111111111111111111';
  const response = await fetch('http://127.0.0.1:3111/api/ping', {
    headers: { traceparent: `00-${traceId}-2222222222222222-01` },
  });
  assert.equal(response.status, 200);
  let spans = [];
  for (let i = 0; i < 100; i++) {
    spans = received.flatMap((batch) =>
      (batch.resourceSpans ?? []).flatMap((resource) =>
        (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? []),
      ),
    );
    if (spans.some((span) => span.traceId === traceId)) break;
    await pause(100);
  }
  assert.ok(
    spans.some((span) => span.traceId === traceId),
    'No correlated automatic Next API spans received: ' + output,
  );
  assert.ok(
    spans.some((span) => /GET|request|render/i.test(span.name)),
    'No incoming Next request spans',
  );
  console.log(
    `Next automatic OTel local collector: ${spans.length} spans, API traceparent preserved`,
  );
} finally {
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  collector.close();
}
