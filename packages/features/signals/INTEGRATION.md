# SignalKit integration

These packages are local workspace packages, not yet available on npm. Build the cloned repo first. ESM exports/declarations live in each dist directory. Pack them with pnpm pack to test outside this workspace; do not publish before the release checklist.

## Platform availability

The SDK is designed around platform-independent contracts. Next.js and Bun are the current alpha integrations; the dedicated integrations below are **coming soon**, pending development. No release dates are committed. Planned platforms do not yet have verified installation recipes or native SDKs.

| Platform                          | Status             | Integration scope                                                     |
| --------------------------------- | ------------------ | --------------------------------------------------------------------- |
| Next.js App Router (Node runtime) | Available in alpha | Browser provider and separate Node instrumentation; examples below    |
| Bun                               | Available in alpha | Wrapped incoming handlers and explicit outbound fetch; examples below |
| SvelteKit                         | Coming soon        | Framework adapter and integration examples                            |
| Hono                              | Coming soon        | Framework adapter and integration examples                            |
| Astro                             | Coming soon        | Framework adapter and integration examples                            |
| Node.js (standalone)              | Coming soon        | Dedicated generic server integration and examples                     |
| HTML / vanilla JavaScript         | Coming soon        | Standalone browser setup and integration examples                     |
| Django (Python)                   | Coming soon        | Native Python SDK and framework adapter                               |
| Laravel (PHP)                     | Coming soon        | Native PHP SDK and framework adapter                                  |
| FastAPI                           | Coming soon        | Dedicated integration and examples pending development                |
| Spring Boot                       | Coming soon        | Dedicated integration and examples pending development                |
| Express                           | Coming soon        | Dedicated integration and examples pending development                |
| NestJS                            | Coming soon        | Dedicated integration and examples pending development                |
| CodeIgniter                       | Coming soon        | Dedicated integration and examples pending development                |
| Vue                               | Coming soon        | Dedicated integration and examples pending development                |
| Angular                           | Coming soon        | Dedicated integration and examples pending development                |
| Fastify                           | Coming soon        | Dedicated integration and examples pending development                |

The portable browser/server building blocks already exist, but that does not establish support for the coming-soon hosts. Next Edge remains deferred and unsupported.

## Next.js browser

```tsx
'use client';
import { SignalKitProvider, createGA4Provider, createMetaPixelProvider } from '@techinject/nextjs';
const config = {
  providers: [
    createGA4Provider({ measurementId: 'G-YOURID' }),
    createMetaPixelProvider({ pixelId: 'YOUR_NUMERIC_ID' }),
  ],
  consent: { analytics: false, marketing: false, observability: false },
  traceOrigins: ['https://your-api.example'],
  excludeUrls: ['/telemetry'],
};
export function Providers({ children }: { children: React.ReactNode }) {
  return <SignalKitProvider config={config}>{children}</SignalKitProvider>;
}
```

Use public IDs from your host config and real persisted consent. Numeric placeholder above must be replaced before creating Meta provider. Place provider around root layout children. useSignals().track accepts typed ecommerce inputs; useSignals().setConsent updates consent (keep parent config consistent). Provider structural config is init-only: remount on provider, observer or origin changes. Default auto pages track initial/pathname changes, not query/hash-only transitions. Direct browser SDK auto-starts unless autoTrack:false; start/stop/dispose are explicit controls.

GA4 provider sends explicit pages; disable automatic history page changes in Enhanced Measurement to avoid vendor-side duplicates. SignalKit does not own scripts previously loaded by other tools. Configure CSP with vendor domains/nonces, third-party privacy/masking and consent policies. Clarity is optional createClarityProvider({projectId}). Browser legacy globals + multiple tools require host integration validation.

## Next Node automatic incoming telemetry

Install/use @techinject/nextjs-server separately from browser package. In instrumentation.ts:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SIGNALKIT_OTEL_ENABLED === 'true') {
    const { registerNextInstrumentation } = await import('@techinject/nextjs-server');
    registerNextInstrumentation({ serviceName: 'your-service' });
  }
}
```

Configure OTEL_EXPORTER_OTLP_ENDPOINT/host credentials and collector filters. This is host-owned global OTel; SignalKit consent does not control it. Preserve an existing provider instead of registering another. Next's default spans cover framework requests; outbound calls use createNextSignals().fetch when you need this SDK's correlation. Supplemental createNextRequestErrorHandler(observer,{enabled:()=>hostAllowsTechnicalTelemetry}) can be exported as onRequestError. No raw exception text/headers included. Next Edge deferred.

## Bun server

```ts
import { createServerSignals, createOTLPObserver } from '@techinject/server';
import { instrumentBunFetch } from '@techinject/bun';
const signals = createServerSignals({
  consent: { analytics: false, marketing: false, observability: true },
  observer: createOTLPObserver({
    endpoint: 'http://localhost:4318/v1/traces',
    serviceName: 'shop-api',
  }),
  traceOrigins: ['https://your-service.example'],
  excludeUrls: ['/v1/traces'],
});
Bun.serve({ fetch: instrumentBunFetch(signals, async (req) => Response.json({ ok: true })) });
```

Wrap every Bun routes-table handler too: routes bypass fallback fetch. Supply routeResolver for arbitrary dynamic/sensitive slugs. Use signals.fetch for outbound calls; global fetch is untouched. Call flush on shutdown before dispose with your host shutdown budget. Browser flush now waits for bounded observer records and its optional flush hook; browser observer deadlines default to2s and use timeoutMs when supplied (clamped1–30,000ms), separately from the core default5s dispatch deadline. Server telemetry preserves valid existing outbound traceparent IDs in emitted records. Configure observer errors/onDiagnostic for overload/rejection visibility. OTLP HTTP JSON works with collectors configured for that protocol; SigNoz examples require collector deployment/credentials and are not live-tested here.

## Verified purchase and provider delivery

Store eventId with the trusted host order. Browser and server copies both emit purchase using same eventId and transaction_id. Verify payment signatures and captured/paid state against trusted order currency/amount; never trust a client success page. The Bun example shows raw HMAC and a durable local SQLite outbox with replay tests. Production applications supply their own persistence, per-user consent, signed webhook rotation, currency exponents and order line items.

createMetaCapiProvider requires pixelId, accessToken, explicit supported apiVersion, eventSourceUrl and userData callback with SHA-256 hashed em/ph/external_id or validated fbp/fbc. It deliberately refuses arbitrary matching fields. Hashes remain personal data; host supplies consent/retention policy. No access token belongs browser config. A stable event ID enables Meta dedup but actual matching/dedup is unverified until sandbox/live tests.

Default denied consent drops data without replay; resource limits drop overload. Custom providers should honour AbortSignal and implement setConsent/dispose. Telemetry delivery is best effort; persisted outbox/retry belongs host. Safe route heuristics cannot remove every sensitive pathname: supply templates/exclusions and avoid PII in named commerce fields. External scripts can inspect host URL/DOM/cookies independently.

## Copyable host examples

The [Next.js guide](https://techinjectindia.github.io/signal-kit/docs/nextjs/), [Bun guide](https://techinjectindia.github.io/signal-kit/docs/bun/) and [README](../../../README.md#integration-examples) contain the same setup examples. Start with the Next provider above, then wire its layout and host events:

### Wire the Next.js root layout

Use the Providers client component shown above. Mount it once around the application; keep this root layout a server component.

**app/layout.tsx**

```tsx
import type { ReactNode } from 'react';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Apply consent and track an add-to-cart event

Synthetic interaction example: consent stays denied until the visitor clicks Allow. In production, replace the demo buttons with your consent manager and persist its choices. Call track after the host cart update succeeds. This uses the GA4 provider configured above; no server secret is needed.

**app/cart-demo.tsx**

```tsx
'use client';
import { useSignals } from '@techinject/nextjs';

export function CartDemo() {
  const signals = useSignals();
  return (
    <>
      <button
        onClick={() =>
          signals.setConsent({
            analytics: true,
            marketing: false,
            observability: false,
          })
        }
      >
        Allow analytics
      </button>
      <button
        onClick={() =>
          signals.setConsent({
            analytics: false,
            marketing: false,
            observability: false,
          })
        }
      >
        Withdraw analytics
      </button>
      <button
        onClick={async () => {
          const outcomes = await signals.track({
            name: 'add_to_cart',
            properties: {
              currency: 'INR',
              value: 450,
              items: [{ item_id: 'notebook', price: 450, quantity: 1 }],
            },
          });
          console.log(outcomes); // Safe SDK outcomes; not proof of attribution.
        }}
      >
        Record demo add to cart
      </button>
    </>
  );
}
```

### Enable Next.js Node request telemetry

Set SIGNALKIT_OTEL_ENABLED=true and OTEL_EXPORTER_OTLP_ENDPOINT in server-only host configuration to enable this. Use your own OTLP collector and its credentials. This global framework tracing is host-owned and independent of browser consent; retain an existing tracing setup instead of registering twice. Next Edge is unsupported.

**instrumentation.ts (project root, or src/ when using src/app)**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SIGNALKIT_OTEL_ENABLED === 'true') {
    const { registerNextInstrumentation } = await import('@techinject/nextjs-server');
    registerNextInstrumentation({ serviceName: 'shop-nextjs' });
  }
}
```

### Run Bun API tracking without a collector

Save this file inside the built workspace and run pnpm --filter @signalkit/example-bun exec bun trace-demo.ts. Visit http://localhost:3300/orders/demo to see a local request record with /orders/:id. Observability is enabled for this synthetic fixture; production hosts supply their own policy. Wrap each routes-table handler too, because those bypass fallback fetch.

**examples/bun/trace-demo.ts**

```ts
import { createServerSignals } from '@techinject/server';
import { instrumentBunFetch } from '@techinject/bun';

const signals = createServerSignals({
  consent: { analytics: false, marketing: false, observability: true },
  observer: {
    record(record) {
      console.log(record);
    },
  },
  excludeUrls: ['/health'],
});
const server = Bun.serve({
  port: 3300,
  fetch: instrumentBunFetch(
    signals,
    (request) => {
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

## Development

Node22 + pnpm10.24.0, Bun1.3.4 for runtime fixture. pnpm install --frozen-lockfile; pnpm build; pnpm test; pnpm typecheck; pnpm test:boundaries. pnpm --filter @signalkit/example-nextjs dev or pnpm --filter @signalkit/example-bun dev. Modern browser required; exact verified versions in compatibility doc. Upgrade owner is maintainer; verify leaf packages and both consumer hosts.

## Technical references

[Next instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation), [Next OpenTelemetry](https://nextjs.org/docs/app/guides/open-telemetry), [Bun server](https://bun.sh/docs/runtime/http/server), [OTLP exporters](https://opentelemetry.io/docs/languages/js/exporters/), [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/). Follow current provider documentation before enabling a live account; recorded fixture evidence is separate.
