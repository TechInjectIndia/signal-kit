# Trace Bun APIs without raw request payloads — SignalKit guide

By SignalKit maintainers · 2026-10-06

Wrap Bun request handlers, capture status and duration, correlate outbound fetches, and keep sensitive paths and raw bodies out of technical telemetry.

Public route: https://techinjectindia.github.io/signal-kit/guides/bun-api-tracing/

## Start with request metadata

You often need to know which endpoint failed and how long it took before you need its raw request body. SignalKit’s Bun adapter captures method, safe route, status, duration and trace context. It does not attach request bodies or arbitrary headers to those request records.

Route names still deserve attention. Safe-route heuristics replace numeric IDs, UUIDs, long segments and email-like segments, but cannot recognize every sensitive slug. Supply route templates and exclusions based on your actual API. Do not include secrets in URL path names.

## Run the local server fixture

The workspace contains an actual Bun HTTP example. Start the server fixture below, inspect local records, and use the synthetic signed-payment tests to check request outcomes without external credentials.

```sh
git clone --branch main https://github.com/TechInjectIndia/signal-kit.git
cd signal-kit
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @signalkit/example-nextjs dev
# In another terminal from repository root:
pnpm --filter @signalkit/example-bun dev
```

## Wrap incoming requests explicitly

This code is a complete local server that prints safe records through an injected observer. Save it as examples/bun/trace-demo.ts inside the built workspace, then run pnpm --filter @signalkit/example-bun exec bun trace-demo.ts. Technical consent here is for the synthetic fixture; your real host supplies its own policy.

```ts
import { createServerSignals } from '@techinject/server';
import { instrumentBunFetch } from '@techinject/bun';

const signals = createServerSignals({
  consent: { analytics: false, marketing: false, observability: true },
  observer: {
    record: (record) => {
      console.log(record);
    },
  },
  traceOrigins: ['http://localhost:3300'],
  excludeUrls: ['/health'],
});
const server = Bun.serve({
  port: Number(Bun.env.PORT ?? '3300'),
  fetch: instrumentBunFetch(
    signals,
    async (request) => {
      const path = new URL(request.url).pathname;
      if (path === '/health') return Response.json({ ok: true });
      if (path.startsWith('/orders/')) return Response.json({ ok: true });
      return new Response('Not found', { status: 404 });
    },
    (request) => (new URL(request.url).pathname.startsWith('/orders/') ? '/orders/:id' : undefined),
  ),
});
process.on('SIGINT', async () => {
  server.stop();
  await signals.flush();
  signals.dispose();
  process.exit(0);
});
```

## Check safe routes and failures

Request http://localhost:3300/orders/customer-secret and confirm the observer records /orders/:id. Request /missing and check status 404 with error true. Request /health and confirm the explicit exclusion suppresses telemetry. The example returns response bodies unchanged.

If you use Bun’s routes table, wrap each route handler: a routes-table match bypasses the fallback fetch handler. Global fetch is untouched. Use signals.fetch inside a wrapped request to create outbound request telemetry and preserve the incoming trace context.

## Connect your own OTLP collector

Replace the console observer with createOTLPObserver. The endpoint must accept OTLP HTTP JSON. Configure credentials server-side if your collector requires them, and exclude telemetry transport paths to avoid tracing export recursively.

```ts
import { createServerSignals, createOTLPObserver } from '@techinject/server';
import { instrumentBunFetch } from '@techinject/bun';

const signals = createServerSignals({
  consent: { analytics: false, marketing: false, observability: true },
  observer: createOTLPObserver({
    endpoint: 'http://localhost:4318/v1/traces',
    serviceName: 'shop-api',
  }),
});

Bun.serve({
  fetch: instrumentBunFetch(signals, async () => Response.json({ ok: true })),
});
```

- Allowlist traceOrigins for destinations that should receive traceparent; cross-origin browser requests also need compatible CORS configuration.
- Use signals.fetch for outbound calls rather than expecting global fetch patches.
- Observe bounded capacity, timeout and transport errors through the observer’s onError callback.
- Flush within your host’s shutdown budget; telemetry remains best effort.

## What does the local check establish?

The repository exercises an actual Bun server and a local OTLP recorder. That checks request instrumentation and JSON transport shapes. It does not prove a deployed SigNoz collector, production durability or complete distributed-trace visibility.

Request telemetry belongs in observability, not as one GA4 or Meta marketing event for every API call. Next.js uses a separate host-owned OpenTelemetry integration; its global policy is independent of SignalKit’s consent categories.

[Bun HTTP server reference](https://bun.sh/docs/runtime/http/server) · [OTLP specification](https://opentelemetry.io/docs/specs/otlp/)
