# SignalKit integration

These packages are local workspace packages, not yet available on npm. Build the cloned repo first. ESM exports/declarations live in each dist directory. Pack them with pnpm pack to test outside this workspace; do not publish before the release checklist.

## Platform availability

The SDK is designed around platform-independent contracts. Next.js, Bun and SvelteKit are the current alpha integrations; the dedicated integrations below are **coming soon**, pending development. No release dates are committed. Planned platforms do not yet have verified installation recipes or native SDKs.

| Platform                          | Status             | Integration scope                                                     |
| --------------------------------- | ------------------ | --------------------------------------------------------------------- |
| Next.js App Router (Node runtime) | Available in alpha | Browser provider and separate Node instrumentation; examples below    |
| Bun                               | Available in alpha | Wrapped incoming handlers and explicit outbound fetch; examples below |
| SvelteKit 3 / Svelte 5 (Node)     | Available in alpha | Browser lifecycle and isolated server hooks                           |
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

## Public IDs and server secrets

Each local example has a root `signalkit.config.ts` for public GA4, Meta Pixel and Clarity IDs. The Next.js lab configures all three with clearly fake IDs so the inspector can show per-provider adapter outcomes after analytics and marketing consent. These outcomes do not verify a real provider account. The SvelteKit browser lab keeps external providers disabled by default. The Bun fixture is server-only, so its public ID file does not register browser providers. Replace IDs locally for host-owned account tests; keep real customer IDs out of this repository. Standalone static HTML continues to pass public IDs with `data-ga4-id`, `data-meta-id` and `data-clarity-id` attributes.

Keep the Meta CAPI access token, OTLP authentication headers and webhook secret in server-only environment variables. Never put them in `signalkit.config.ts` or any file imported by browser code.

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

Use public IDs from your host config and real persisted consent. Numeric placeholder above must be replaced before creating Meta provider. Place provider around root layout children. useSignals().track accepts typed ecommerce inputs; useSignals().setConsent updates consent (keep parent config consistent). Provider structural config is init-only: remount on provider, observer or origin changes. Default auto pages track initial/pathname changes, not query/hash-only transitions. Set `trackHash: true` only for a `#/` or `#!/` hash router; ordinary in-page anchors do not emit page views. Direct browser SDK auto-starts unless autoTrack:false; start/stop/dispose are explicit controls.

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

`traceOrigins` accepts exact origins for absolute outbound URLs. Relative `signals.fetch('/api/...')` calls do not receive a new `traceparent` header by default. If your host fetch transport supports relative URLs and you want propagation for them, set `traceRelative: true` in `createServerSignals` config. Existing `traceparent` headers are preserved. Do not put `''`, `'/'` or `'relative'` in `traceOrigins`; those values have no special meaning.

Declarative Bun routes bypass fallback fetch. Pass the routes table through `instrumentBunRoutes` to capture both direct handlers and method-map handlers with their route patterns:

```ts
import { instrumentBunRoutes } from '@techinject/bun';

Bun.serve({
  routes: instrumentBunRoutes(signals, {
    '/orders/:id': {
      GET: () => Response.json({ ok: true }),
    },
  }),
  fetch: instrumentBunFetch(signals, () => new Response('Not found', { status: 404 })),
});
```

Supply routeResolver for arbitrary dynamic/sensitive slugs and order/reference IDs in the fallback handler. `safeRoute` preserves ordinary product slugs containing numbers; use route templates or exclusions wherever a slug may contain sensitive data. Use signals.fetch for outbound calls; global fetch is untouched. Call flush on shutdown before dispose with your host shutdown budget. Browser flush now waits for bounded observer records and its optional flush hook; browser observer deadlines default to2s and use timeoutMs when supplied (clamped1–30,000ms), separately from the core default5s dispatch deadline. Server telemetry preserves valid existing outbound traceparent IDs in emitted records. `onDiagnostic` reports core event outcomes; browser observer records above the 32-pending bound are silently dropped and do not produce event/provider outcomes. OTLP HTTP JSON works with collectors configured for that protocol; SigNoz examples require collector deployment/credentials and are not live-tested here.

## Experimental standalone browser bundle

The browser build produces `packages/features/signals/browser/dist/cdn/signalkit.global.js` for a plain script tag. This is an experimental bundle, not a verified HTML, PHP, Shopify or WordPress integration. Use only public provider IDs:

```html
<script src="/assets/signalkit.global.js" data-ga4-id="G-YOURID"></script>
```

With no `data-auto-consent` attribute, all consent categories start denied. Connect the host consent banner to the visitor's actual choices after the script loads:

```js
window.signals.setConsent({
  analytics: analyticsAllowed,
  marketing: marketingAllowed,
  observability: observabilityAllowed,
});
```

Only `data-auto-consent="true"` pregrants all three categories, so use it solely when the host has already established that consent. Denied events are dropped and never replayed. The bundle listens for `product_view`, `add_to_cart` and `begin_checkout` clicks marked with `[data-signal]`. Supply real `data-item-id`, `data-price` and uppercase three-letter `data-currency` values on each element. Cart and checkout clicks also require `data-quantity`; product views omit quantity when it is not provided. Missing or invalid attributes skip tracking instead of fabricating values. A host can observe safe diagnostics without receiving the attribute values:

```js
window.addEventListener('signalkit:diagnostic', (event) => {
  console.log(event.detail); // { status: 'invalid', reason: 'missing_attribute', attribute: 'data-price' }
});
```

For example, this cart button supplies every required value:

```html
<button
  data-signal="add_to_cart"
  data-item-id="sku-1"
  data-price="450"
  data-currency="INR"
  data-quantity="1"
>
  Add to cart
</button>
```

Host code should still track verified purchases from trusted server state.

## Verified purchase and provider delivery

Store eventId with the trusted host order. Browser and server copies both emit purchase using same eventId and transaction_id. Verify payment signatures and captured/paid state against trusted order currency/amount; never trust a client success page. The Bun example shows raw HMAC and a durable local SQLite outbox with replay tests. Production applications supply their own persistence, per-user consent, signed webhook rotation, currency exponents and order line items.

createMetaCapiProvider requires pixelId, accessToken, explicit supported apiVersion, eventSourceUrl and a userData callback. Matching fields may be prehashed SHA-256 hex or plaintext normalized by the adapter before hashing. The adapter rejects unsupported fields and invalid country/date/gender formats. Plaintext rules are:

| Field                           | Normalization before SHA-256                                                               |
| :------------------------------ | :----------------------------------------------------------------------------------------- |
| `em`, `fn`, `ln`, `external_id` | Trim and lowercase.                                                                        |
| `ph`                            | Keep digits only. Include the country calling code in the host value.                      |
| `ct`                            | Lowercase and remove spaces, digits and punctuation.                                       |
| `zp`                            | Lowercase, remove whitespace and discard the suffix after `-`.                             |
| `country`                       | Lowercase two-letter ISO country code; host supplies the correct code, not a country name. |
| `db`                            | `YYYYMMDD`; `YYYY-MM-DD` is converted and invalid calendar dates are rejected.             |
| `ge`                            | `m` or `f`; `male` and `female` are converted.                                             |

Already hashed 64-character hex values pass through without rehashing. `fbp`/`fbc` are validated rather than hashed; IP address and user agent are passed through when explicitly supplied. These rules follow Meta's server-side SDK [normalization](https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/serverside/normalize.py) and [field formats](https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/serverside/user_data.py). Hashes remain personal data; host supplies consent/retention policy and must provide correctly normalized input where local conventions matter. No access token belongs browser config. A stable event ID enables Meta dedup but actual matching/dedup is unverified until sandbox/live tests.

Default denied consent drops data without replay; resource limits drop overload. Custom providers should honour AbortSignal and implement setConsent/dispose. Telemetry delivery is best effort; persisted outbox/retry belongs host. GA4 page location/referrer and Meta CAPI event source URL omit query strings and fragments. Safe route heuristics cannot remove every sensitive pathname: supply templates/exclusions and avoid PII in named commerce fields. External scripts can inspect host URL/DOM/cookies independently.

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

## SvelteKit 3 (Svelte 5, Node runtime)

Use separate @techinject/sveltekit (client) and @techinject/sveltekit-server (server) packages. Both are source/local-tarball alpha packages, not npm releases. See the [runnable lab](../../../examples/sveltekit/README.md) and [web guide](https://techinjectindia.github.io/signal-kit/docs/sveltekit/).

```svelte
<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { createSvelteKitClient, createGA4Provider } from '@techinject/sveltekit';
  let { children } = $props();
  const client = createSvelteKitClient({
    providers: [createGA4Provider({ measurementId: 'G-YOURID' })],
    consent: { analytics: false, marketing: false, observability: false },
  });
  setContext('signals', client);
  onMount(() => { client.mount(); return () => client.dispose(); });
</script>
{@render children()}
```

In a mounted child, obtain the layout client with getContext and apply the consent manager's real persisted choice using client.getSignals().setConsent(...). track accepts the same typed ecommerce inputs as the other browser adapters. Automatic initial/pathname pages are already enabled; do not duplicate them with an afterNavigate page call. After consent, page() is an explicit optional current-page event because denied pages are not replayed. Configure a browser observer for fetch/XHR technical telemetry.

```ts
// src/hooks.server.ts — server-only, Node runtime
import { createSvelteKitHooks, createOTLPObserver } from '@techinject/sveltekit-server';
const hooks = createSvelteKitHooks((event) => ({
  // Replace with host-authorized policy for this request; denied by default.
  consent: { analytics: false, marketing: false, observability: false },
  observer: createOTLPObserver({
    endpoint: 'http://localhost:4318/v1/traces',
    serviceName: 'shop-sveltekit',
  }),
  excludeUrls: ['/v1/traces'],
  traceOrigins: ['https://inventory.example'],
}));
export const handle = hooks.handle;
export const handleFetch = hooks.handleFetch;
```

Create fresh observer/provider instances per request. The adapter uses route.id templates, preserves SvelteKit fetch semantics, flushes bounded work and disposes after resolve. Compose authentication before handle using sequence if policy depends on locals. Prerendering may invoke handle; static assets, Edge and background work after resolve are outside this Node request scope. timeoutMs controls bounded telemetry wait; the host owns durable purchases/retries. The declared peer range is `@sveltejs/kit >=3 <4`; SvelteKit 3.0.1 with Svelte 5 has consumer runtime evidence, while Kit 2 is unverified.

## Supported event contracts

All events are validated and sanitized before dispatch. Unknown properties are stripped. Each configured provider receives the event only when its consent category is granted; CAPI requires a separate server-side `track` call with approved matching data.

| SDK event        | GA4 event          | Meta Pixel event                  | Clarity behavior                   | Meta CAPI support                 |
| ---------------- | ------------------ | --------------------------------- | ---------------------------------- | --------------------------------- |
| `page_view`      | `page_view`        | `PageView` (standard)             | Page/session capture; no API event | `PageView` (standard)             |
| `product_view`   | `view_item`        | `ViewContent` (standard)          | `product_view` event               | `ViewContent` (standard)          |
| `add_to_cart`    | `add_to_cart`      | `AddToCart` (standard)            | `add_to_cart` event                | `AddToCart` (standard)            |
| `begin_checkout` | `begin_checkout`   | `InitiateCheckout` (standard)     | `begin_checkout` event             | `InitiateCheckout` (standard)     |
| `purchase`       | `purchase`         | `Purchase` (standard)             | `purchase` event                   | `Purchase` (standard)             |
| `generate_lead`  | `generate_lead`    | `Lead` (standard)                 | `generate_lead` event              | `Lead` (standard)                 |
| `phone_click`    | `phone_click`      | `Contact` (standard)              | `phone_click` event                | `Contact` (standard)              |
| `whatsapp_click` | `whatsapp_click`   | `Contact` (standard)              | `whatsapp_click` event             | `Contact` (standard)              |
| `sign_up`        | `sign_up`          | `CompleteRegistration` (standard) | `sign_up` event                    | `CompleteRegistration` (standard) |
| `login`          | `login`            | `Login` (custom)                  | `login` event                      | `Login` (custom)                  |
| `search`         | `search`           | `Search` (standard)               | `search` event                     | `Search` (standard)               |
| `custom_event`   | validated `action` | validated `action` (custom)       | validated `action` event           | validated `action` (custom)       |

`custom_event.properties.action` must match `^[a-z][a-z0-9_]{0,39}$`; invalid names are rejected before dispatch. Meta Pixel uses `trackSingleCustom` for custom names. GA4 receives `event_id`, and Meta Pixel/CAPI receive the corresponding event ID. Clarity's browser event API accepts only a name, so it does not receive an event-level ID or provide cross-platform deduplication. `page_view` starts Clarity's page/session capture without emitting an explicit Clarity event. All other listed events use Clarity's `event` API.

### Example: Tracking leads and contacts

```ts
// Track a lead form submission
await signals.track({
  name: 'generate_lead',
  properties: {
    lead_type: 'consultation_request',
    currency: 'INR',
    value: 500,
  },
});

// Track a WhatsApp or Phone button click
await signals.track({
  name: 'whatsapp_click',
  properties: {
    channel: 'whatsapp',
  },
});
```

## Development

Node22 + pnpm10.24.0, Bun1.3.4 for runtime fixture. pnpm install --frozen-lockfile; pnpm build; pnpm test; pnpm typecheck; pnpm test:boundaries. pnpm --filter @signalkit/example-nextjs dev or pnpm --filter @signalkit/example-bun dev. Modern browser required; exact verified versions in compatibility doc. Upgrade owner is maintainer; verify leaf packages and both consumer hosts.

## Technical references

[Next instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation), [Next OpenTelemetry](https://nextjs.org/docs/app/guides/open-telemetry), [Bun server](https://bun.sh/docs/runtime/http/server), [OTLP exporters](https://opentelemetry.io/docs/languages/js/exporters/), [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/). Follow current provider documentation before enabling a live account; recorded fixture evidence is separate.

[SvelteKit guide](https://techinjectindia.github.io/signal-kit/docs/sveltekit/) · [SvelteKit local lab](../../../examples/sveltekit/README.md)

## In-app connections dashboard

The optional browser renderer mounts against an existing SDK instance. See [dashboard setup](../../../docs/CONNECTIONS-DASHBOARD.md) for full Next.js and SvelteKit /connections routes, Bun server snapshots, portable HTML/JavaScript wiring, and the coming-soon status for all 14 planned platforms. The Next lab includes `/connections`.

[Public dashboard setup guide](https://techinjectindia.github.io/signal-kit/docs/connections/) covers opening the route, status meanings, styling, consent checks and authentication. Technical observers and provider account health are not included.

## Versioning and upgrades — all frameworks

See [UPGRADING.md](../../../docs/UPGRADING.md) for exact package versions, Next.js/SvelteKit/Bun commands, source updates, CDN imports, rollback and all coming-soon platforms. Existing deployments do not automatically fetch SDK changes. All nine npm packages and the browser CDN module are verified at version `0.1.0-alpha.2`.

## Observability backends (unreleased)

See [observability setup](../../../docs/CLOUD-OBSERVABILITY.md) for configuring the existing OTLP exporter against local/cloud SigNoz or Grafana-compatible ingestion, adding the host-owned Sentry bridge, combining observers and completing serverless exports. New Sentry/composition helpers are server-only and not yet published.
