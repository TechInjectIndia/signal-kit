# SignalKit integration

The nine `@techinject` packages are published as npm alphas (see [UPGRADING.md](../../../docs/UPGRADING.md) for the current exact version). The commerce lifecycle, identity, consent-time page view and server GA4 behavior described below is unreleased: build the cloned repo to use it. ESM exports/declarations live in each dist directory. Pack them with bun pm pack, which rewrites workspace:\* dependency ranges (npm pack does not), to test outside this workspace; do not publish before the release checklist.

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

Use public IDs from your host config and real persisted consent. Numeric placeholder above must be replaced before creating Meta provider. Place provider around root layout children. useSignals().track accepts typed ecommerce inputs; useSignals().setConsent updates consent (keep parent config consistent). Provider structural config is init-only: remount on provider, observer or origin changes. Automatic pages track initial/pathname changes, not query-only transitions. Set `trackHash: true` only for a `#/` or `#!/` hash router; ordinary in-page anchors do not emit page views. There is no `trackQuery` option. Direct browser SDK auto-starts unless autoTrack:false; start/stop/dispose are explicit controls.

`SignalKitProvider` applies a changed `config.consent` in a layout effect, before child effects run, so a child that tracks on first render or on a consent change sees current consent. The initial consent comes from the instance config; only later changes call `setConsent`. SvelteKit starts the client before the host applies consent so a consent-time page view can fire.

GA4 provider sends explicit pages; disable automatic history page changes in Enhanced Measurement to avoid vendor-side duplicates. SignalKit does not own scripts previously loaded by other tools. Configure CSP with vendor domains/nonces, third-party privacy/masking and consent policies. Clarity is optional createClarityProvider({projectId}). Browser legacy globals + multiple tools require host integration validation.

The GA4 adapter queues a denied default for `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization` before its measurement commands. The host's saved `analytics` choice controls `analytics_storage` before the first event. By default, the adapter updates only `analytics_storage`; it does not grant Google ad fields when `marketing` is true. If the host's marketing choice authorizes all three Google ad purposes, opt in with `createGA4Provider({ measurementId: 'G-YOURID', googleAdsConsent: 'marketing' })`; only then does `marketing` control `ad_storage`, `ad_user_data` and `ad_personalization`. Later `setConsent` calls update Google when the effective choice changes; repeated events do not resend consent. Withdrawing consent or disposing the adapter revokes previously granted fields. Other tags or consent managers may issue their own Google consent commands. Persist consent in the host and pass the saved choice when creating SignalKit; the adapter only retains it for its current lifetime. See [GA4 consent mapping and upgrade impact](../../../docs/GA4-CONSENT-MAPPING.md).

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

All consent categories start denied. Connect the host consent banner to the visitor's actual choices after the script loads:

```js
window.signals.setConsent({
  analytics: analyticsAllowed,
  marketing: marketingAllowed,
  observability: observabilityAllowed,
});
```

The script has no attribute that grants consent. Denied events are dropped and never replayed. The bundle listens for `product_view`, `add_to_cart` and `begin_checkout` clicks marked with `[data-signal]`. Supply real `data-item-id`, `data-price` and uppercase three-letter `data-currency` values on each element. Cart and checkout clicks also require `data-quantity`; product views omit quantity when it is not provided. Missing or invalid attributes skip tracking instead of fabricating values. A host can observe safe diagnostics without receiving the attribute values:

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

createMetaCapiProvider requires pixelId, accessToken, explicit supported apiVersion, and, for each send, an event source URL and matching data. Pass both per call in `context.meta.eventSourceUrl` and `context.meta.userData` (see "Per-call server context"). The `eventSourceUrl` option (a web URL, or a function returning the current page URL) and the `userData` callback remain as fallbacks used only when a call supplies none; a per-call value replaces the fallback and is never merged with it. Query strings are dropped from the URL. Meta requires `client_user_agent` for website events, so each call must supply the shopper's user agent plus at least one other identifier. Hashed fields must be SHA-256 hex: `em`, `ph`, `fn`, `ln`, `ge`, `db`, `ct`, `st`, `zp`, `country` and `external_id`. `client_ip_address` (valid IPv4/IPv6), `client_user_agent` and validated `fbp`/`fbc` cookies are sent unhashed, as Meta requires. Plaintext in hashed fields and any other key is rejected. The SDK never hashes plaintext; the host normalizes and hashes before calling the adapter:

- Normalize `ph` to E.164 with the country calling code (for example, synthetic `+12025550199`), then remove the leading `+` and SHA-256 hash the remaining digits. Supply that hash as `ph`.
- The SignalKit Pixel adapter does not send advanced matching, so there is no Pixel-side `external_id` to match. For CAPI, `external_id` must be the SHA-256 of a real, stable host customer key, the same key the host uses elsewhere, with its exact case preserved before hashing. Never derive it from an event ID, URL or random value. If no real identifier exists, omit it and send other permitted matching fields, or skip the CAPI send and record why. Live match quality is unverified.
- Normalize `em` under Meta's email rules before SHA-256 hashing.

- Normalize `fn`, `ln`, `ct`, `st`, `zp`, `country`, `db` and `ge` under Meta's customer information rules (for example lowercase, no spaces or punctuation, two-letter country code, `YYYYMMDD` dates) before SHA-256 hashing.

The adapter passes valid 64-character SHA-256 hex values through without rehashing; it validates IP, user agent and `fbp`/`fbc` without hashing. Missing `client_user_agent` or an invalid event source URL makes that send fail with a safe reason; other providers continue. Hashes, IP addresses and user agents remain personal data; the host supplies consent and retention policy. No access token belongs in browser config. A stable event ID enables Meta dedup, but actual matching and dedup remain unverified until sandbox or live tests. The CAPI provider refuses to send when the event's consent snapshot denies marketing. Meta has no mapping for `remove_from_cart`, `view_cart`, `add_shipping_info`, `refund`, `view_item_list` and `select_item`; those report `skipped`, so no CAPI copy of them exists. `AddPaymentInfo` and `AddToWishlist` are mapped but have not been checked in Meta Test Events.

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

Save this file inside the built workspace and run bun trace-demo.ts from examples/bun. Visit http://localhost:3300/orders/demo to see a local request record with /orders/:id. Observability is enabled for this synthetic fixture; production hosts supply their own policy. Wrap each routes-table handler too, because those bypass fallback fetch.

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

In a mounted child, obtain the layout client with getContext and apply the consent manager's real persisted choice using client.getSignals().setConsent(...). track accepts the same typed ecommerce inputs as the other browser adapters. Automatic initial/pathname pages are already enabled; do not duplicate them with an afterNavigate page call. Denied pages are not replayed. Set `pageOnConsent: true` to send one fresh current-page event when analytics or marketing is granted (see "Consent-time page view and provider preload"), or call page() yourself, not both. Configure a browser observer for fetch/XHR technical telemetry.

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

## Predefined event contracts

The SDK predefines 17 events. All events are validated and sanitized before dispatch. Unknown properties are stripped. Each configured provider receives the event only when its consent category is granted; CAPI requires a separate server-side `track` call with approved matching data. A provider with no mapping for an event reports `skipped`, not an error.

| SDK event           | GA4 event           | Meta Pixel event                  | Clarity behavior                   | Meta CAPI support                 |
| ------------------- | ------------------- | --------------------------------- | ---------------------------------- | --------------------------------- |
| `page_view`         | `page_view`         | `PageView` (standard)             | Page/session capture; no API event | `PageView` (standard)             |
| `product_view`      | `view_item`         | `ViewContent` (standard)          | `product_view` event               | `ViewContent` (standard)          |
| `add_to_cart`       | `add_to_cart`       | `AddToCart` (standard)            | `add_to_cart` event                | `AddToCart` (standard)            |
| `remove_from_cart`  | `remove_from_cart`  | none (`skipped`)                  | `remove_from_cart` event           | none (`skipped`)                  |
| `view_cart`         | `view_cart`         | none (`skipped`)                  | `view_cart` event                  | none (`skipped`)                  |
| `begin_checkout`    | `begin_checkout`    | `InitiateCheckout` (standard)     | `begin_checkout` event             | `InitiateCheckout` (standard)     |
| `add_shipping_info` | `add_shipping_info` | none (`skipped`)                  | `add_shipping_info` event          | none (`skipped`)                  |
| `add_payment_info`  | `add_payment_info`  | `AddPaymentInfo` (standard)       | `add_payment_info` event           | `AddPaymentInfo` (standard)       |
| `purchase`          | `purchase`          | `Purchase` (standard)             | `purchase` event                   | `Purchase` (standard)             |
| `refund`            | `refund`            | none (`skipped`)                  | `refund` event                     | none (`skipped`)                  |
| `view_item_list`    | `view_item_list`    | none (`skipped`)                  | `view_item_list` event             | none (`skipped`)                  |
| `select_item`       | `select_item`       | none (`skipped`)                  | `select_item` event                | none (`skipped`)                  |
| `add_to_wishlist`   | `add_to_wishlist`   | `AddToWishlist` (standard)        | `add_to_wishlist` event            | `AddToWishlist` (standard)        |
| `generate_lead`     | `generate_lead`     | `Lead` (standard)                 | `generate_lead` event              | `Lead` (standard)                 |
| `sign_up`           | `sign_up`           | `CompleteRegistration` (standard) | `sign_up` event                    | `CompleteRegistration` (standard) |
| `login`             | `login`             | `Login` (custom)                  | `login` event                      | `Login` (custom)                  |
| `search`            | `search`            | `Search` (standard)               | `search` event                     | `Search` (standard)               |

`add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `add_to_wishlist`, `view_item_list`, `select_item` and `purchase` require at least one item. `product_view` may carry an empty item list. `refund` requires `transaction_id`; its `items` are optional (omit them for a full refund), and `value` requires `currency`. The app-owned custom example also requires finite nonnegative `value` when supplied.

The registered example `custom_event.properties.action` must match `^[a-z][a-z0-9_]{0,39}$`; invalid names are rejected before dispatch. Meta Pixel uses `trackSingleCustom` for custom names. GA4 receives `event_id`, and Meta Pixel/CAPI receive the corresponding event ID. Clarity's browser event API accepts only a name, so it does not receive an event-level ID or provide cross-platform deduplication. `page_view` starts Clarity's page/session capture without emitting an explicit Clarity event. All other listed events use Clarity's `event` API.

`search_term`, `custom_event` `action`/`label`/`category`, `lead_type` and sign-up/login `method` reject email- or phone-like values; the whole event is dropped before provider dispatch. The shared contract check also catches common percent-encoded forms. A ten-digit number may be rejected as phone-like in these free-text fields, so use short non-identifying categories. Identifier fields (`item_id`, `transaction_id`, `checkout_id`, `payment_attempt_id`, `item_list_id`, and the Meta projections `order_id` and `content_ids`) skip that bare-digit check, so long numeric SKUs and order numbers pass. They still reject email-like values, a leading `+`, whitespace or parentheses, and whole-value dotted or dashed phone formats such as `202-555-0100`. `user_id` stays banned as an event property; identity travels through `setUser`, never through event fields. Pattern checks do not replace host-side privacy review of every event property.

### Register consumer-defined events once

`phone_click`, `whatsapp_click` and `custom_event` are not built-ins. Import the [Next.js example definitions](../../../examples/nextjs/signalkit.events.ts) or write your own with Zod and `defineEvent`. Each example has its own event module; its root passes the same readonly tuple to the browser/server SDK configuration. Definitions are immutable per instance and cannot override predefined names. The eight lifecycle names (`remove_from_cart`, `view_cart`, `add_shipping_info`, `add_payment_info`, `refund`, `view_item_list`, `select_item`, `add_to_wishlist`) and their GA4 names are now reserved: a consumer definition with one of those names, or a mapping that targets them or Meta `AddPaymentInfo`/`AddToWishlist`, throws at startup. Rename the consumer event or switch to the predefined one.

```ts
import * as z from 'zod/mini';
import { createBrowserSignals, defineEvent } from '@techinject/browser';

const helpOpen = defineEvent({
  name: 'help_open',
  schema: z.object({ section: z.string().check(z.minLength(1), z.maxLength(128)) }),
  map: {
    ga4: { name: 'help_open', properties: { section: 'section' } },
    meta: { name: 'help_open', mode: 'custom', properties: { section: 'section' } },
    clarity: { name: 'help_open' },
  },
});
const events = [helpOpen] as const;
const signals = createBrowserSignals({ events, providers, consent });
await signals.track({ name: 'help_open', properties: { section: 'shipping' } });
```

The property type is inferred from the schema. Use the same tuple in a typed Next hook wrapper, for example `const useAppSignals = () => useSignals<typeof events>()`; pass `events` to the root `SignalKitProvider` config. SvelteKit and server constructors infer the tuple directly. A schema must be a synchronous Zod object with recursively stripping objects and bounded JSON output; passthrough objects, arbitrary records, transforms and non-JSON schema types are rejected. Limits are 8 nested levels, 100 fields/items per container, 2,048 characters per string, 5,000 values and 65,536 serialized characters. All parsed values and mapped properties pass the same PII guard; the host remains responsible for privacy.

Mappings project declared schema keys, with no arbitrary callback. A name may use `{ from: 'action' }`; unsafe or predefined provider names are rejected. Meta mappings require `standard` or `custom` mode and are shared by Pixel/CAPI. Clarity accepts only a name. A consented provider without a mapping returns `skipped` with `event_mapping_missing`; a mapping that fails validation returns `invalid`. Denied providers return `denied` without replay. Local custom providers without a mapping family receive the sanitized canonical event. Registration is root-only; remount/recreate an instance to change definitions.

| Example definition | GA4                | Meta Pixel / CAPI           | Clarity            |
| ------------------ | ------------------ | --------------------------- | ------------------ |
| `phone_click`      | `phone_click`      | `Contact` (standard)        | `phone_click`      |
| `whatsapp_click`   | `whatsapp_click`   | `Contact` (standard)        | `whatsapp_click`   |
| `custom_event`     | validated `action` | validated `action` (custom) | validated `action` |

Contact definitions require literal non-identifying channels. The generic example projects only category, label and value; it never forwards `action` as a property. For server CAPI calls, register the same definitions and supply the existing approved matching-data callback. Registration does not move credentials or purchase verification into browser code. The standalone script bundle exposes only predefined events.

### Example: Tracking leads and registered contacts

```ts
// Register contact/custom definitions at the root before using them.
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

## Commerce lifecycle events and outcomes

The eight events added in this change cover the cart and checkout steps GA4 recommends: `remove_from_cart`, `view_cart`, `add_shipping_info` (optional `shipping_tier`), `add_payment_info` (optional `payment_type` and `payment_attempt_id`), `refund`, `view_item_list`, `select_item` and `add_to_wishlist`. Item entries accept three new optional fields: `index` (integer 0 to 10000), `item_list_id` and `item_list_name`. List events also take `item_list_id` and `item_list_name`.

`product_view` is now normalised. The deprecated single-item shape (`item_id`, `price`, ...) is still accepted but is converted to `{ currency?, value?, items: [item] }` before any provider sees it, so custom providers read `event.properties.items[0]`, not `event.properties.item_id`. Pass the commerce shape in new code. A single-item view with a price but no currency keeps the item and omits the top-level `value`, because a value needs a currency.

Every `track` call resolves to one outcome per provider:

| Status    | Meaning                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sent`    | The adapter completed. Not proof the vendor recorded or attributed the event.                                                                                                     |
| `denied`  | The provider's consent category was not granted. Nothing is queued.                                                                                                               |
| `skipped` | Not an error. The provider was deliberately not called: `event_mapping_missing` (for example Meta and `view_cart`) or `not_targeted` (the call used `categories` or `providers`). |
| `failed`  | The adapter threw, was aborted or timed out.                                                                                                                                      |
| `invalid` | The event or the provider mapping failed validation, or the per-call options were malformed (`event_schema`, `event_mapping`, `track_options`, `event_context`).                  |
| `dropped` | Capacity reached or the SDK was disposed.                                                                                                                                         |

Exhaustive switches over `DispatchStatus` need a `skipped` case, and `ConnectionStatus` gains a `skipped` counter.

For development, pass `debug: true` (and optionally `onWarning`) in the SDK config. Core then warns with `{ code: 'duplicate_event', name }` when the same event name and properties are tracked twice within one second without a caller-supplied `eventId`. The warning never carries values and never suppresses delivery. The host supplies `debug` because the SDK reads no environment.

## Checkout and payment correlation

The SDK does not create checkout or payment sessions and never generates these identifiers. The host mints them, keeps them stable for the attempt, and passes them as optional properties:

- `checkout_id` on `begin_checkout`, `add_shipping_info`, `add_payment_info` and `purchase`.
- `payment_attempt_id` on `add_payment_info` and `purchase`, one value per payment attempt. A retry after a failed payment uses a new value; `transaction_id` stays the order.
- `customer_type`, `'guest'` or `'registered'`, on the same events.

`transaction_id` is the key GA4 uses to deduplicate purchases. `eventId` is the key Meta uses to match the Pixel and CAPI copies. GA4 receives `event_id` as an informational parameter only; do not rely on it for GA4 deduplication.

```ts
const checkout = { checkout_id: order.checkoutId, customer_type: 'guest' as const };
await signals.track({
  name: 'add_payment_info',
  properties: { ...cart, ...checkout, payment_type: 'card', payment_attempt_id: attempt.id },
});
// Later, from verified server state:
await server.track({
  name: 'purchase',
  eventId: order.eventId,
  properties: { ...cart, ...checkout, payment_attempt_id: attempt.id, transaction_id: order.id },
});
```

Sessions belong to the vendors (GA4 `session_id`, the Meta `_fbp` cookie). The SDK has no session of its own.

## Identity

`signals.setUser({ id, customerType? })` and `signals.resetUser()` forward an opaque host user key to providers whose consent category is currently granted. The `id` is 1 to 128 characters matching `^[A-Za-z0-9][A-Za-z0-9._:-]*$`, so an email address or phone number is rejected. Use a stable internal key, never an email, phone number or name. An invalid identity is ignored and clears the previous one.

| Provider   | Effect                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GA4        | `user_id` plus `user_properties.customer_type`, sent as `gtag('set', ...)` and on first `config`, only while analytics is granted. |
| Clarity    | `clarity('identify', id)` while analytics is granted. Clarity has no un-identify call, so `resetUser` only stops further calls.    |
| Meta Pixel | Nothing. The Pixel adapter does not send advanced matching or `external_id` in this release; identity never reaches `fbq`.         |

Withdrawing a category clears the identity for those providers, and granting it again re-applies it. `dispose()` clears it. The identity is never an event property; `user_id` stays banned there.

## Consent-time page view and provider preload

`pageOnConsent: true` (or `{ landingParams: true }`) in the browser, Next or SvelteKit config sends one fresh `page_view` for the current route when analytics or marketing flips from denied to granted while the SDK is started. It is routed only to the newly granted categories and only to providers that declare an `eventFamily`, so a later marketing grant does not repeat the GA4 page view. A route already viewed under that category is not sent again. Earlier denied page views are never replayed: this is a new event for the current route. Hosts that enable it must remove their own post-consent `page()` call or the page is counted twice. It is off by default.

`landingParams: true` adds the landing URL's allowlisted campaign and click parameters to that one GA4 hit when the current URL carries none. It is off by default until GA4 attribution has been checked in DebugView.

`preloadProviders: true` calls each provider's `prepare()` at `start()` for granted categories and again when a category becomes granted. It loads vendor scripts and sends no data. It is off by default, so scripts otherwise load on the first send. A script load under granted consent is still a vendor network request, so enable it only if your consent text covers it.

`signals.track(input, { categories, providers })` (and `signals.page(path, eventId, { categories, providers })`) are the only per-call options the browser accepts. `categories: ['marketing']` delivers to providers in those consent categories; `providers: ['meta-pixel', 'clarity']` delivers only to providers with those names (at most 20 names, each 1 to 64 characters). The others report `skipped` with `not_targeted`. When both are given, a provider must match both. Unknown names target nothing, so every provider reports `skipped`. Targeting never widens consent: a named provider whose category is denied still reports `denied`. Malformed values return `invalid` with `track_options`. Use `providers` to exclude one vendor: GA4 and Clarity share the `analytics` category, so a category filter cannot separate them. Per-call `consent` and `context` are server-only and the browser ignores them. The browser sets `context.page` from the tracked route itself, so GA4 `page_location` and `page_referrer` follow hash routes (with `trackHash`) and an explicit `page('/path')`. Expect a GA4 reporting discontinuity for hosts whose location used to be the raw URL on those routes.

### Beside a host Google Tag Manager container (unverified)

The GA4 adapter shares `window.dataLayer` with any host GTM container and keeps a host-defined `window.gtag` (it assigns its own only with `??=`). Pre-defining `gtag` as a workaround is no longer needed. The adapter queues its own denied `consent default` at its first send, which can land after the host's update; a late default is not expected to override that update, but this is unverified until checked in Tag Assistant. Without `googleAdsConsent: 'marketing'` the adapter never grants the Google ad fields, so the host or container must. Do not also configure a Google tag for the same measurement ID in the container, or every page view and event is sent twice. `dispose()` pushes `analytics_storage: 'denied'` onto the shared queue, which affects the container's tags too. See [GA4 Consent Mode mapping](../../../docs/GA4-CONSENT-MAPPING.md#running-beside-a-host-google-tag-manager-container--unverified).

## Provider identifiers for server events

`await signals.getProviderIds({ timeoutMs })` returns identifiers the vendors already hold in the browser, for the host to send to its server with the order: `{ ga4: { clientId, sessionId }, meta: { fbp, fbc } }`. Only providers whose category is granted are asked, values are validated, nothing is retained, and the default wait is 500 ms (clamped to 50 to 2000). `fbc` falls back to a value built from the stored `fbclid` when no `_fbc` cookie exists. The host stores these with the order and passes them back in `context` on the server.

## Per-call server context

```ts
await server.track(input, {
  consent: order.consentSnapshot, // replaces instance consent for this call only
  context: {
    ga4: { clientId, sessionId, userId },
    meta: { userData, eventSourceUrl },
    page: { location, referrer },
  },
  categories: ['analytics'], // optional targeting by consent category
  providers: ['ga4-mp'], // optional targeting by provider name; must match both when combined
});
```

Core validates the options and forwards `page` plus only the slice for the receiving provider's family; a custom provider without an `eventFamily` receives no context. Context never appears in diagnostics. A per-call `consent` is not changed by `setConsent`, and its in-flight sends are aborted only by `dispose()`. Each event carries its effective consent snapshot, and the CAPI and Measurement Protocol providers refuse sends whose snapshot denies their category. Malformed options return `invalid` with `track_options` or `event_context`. Because context is per call, concurrent requests on one shared server instance cannot see each other's shopper data.

## Server-side GA4 purchases

`createGA4MeasurementProtocolProvider({ measurementId, apiSecret })` (exported by `@techinject/server`, `@techinject/nextjs-server` and `@techinject/sveltekit-server`) is a server provider named `ga4-mp`, family `ga4`, category `analytics`. It posts to `https://www.google-analytics.com/mp/collect`; set `endpoint` to `https://region1.google-analytics.com/mp/collect` for EU collection. The API secret travels only in the request query and is never logged or included in an error.

- The browser `client_id` must come from the same web stream as `measurementId`, through `context.ga4.clientId` (or the `clientId` fallback function). The SDK never invents one; a send without a valid one fails.
- `sessionId` and `userId` are optional. With a session the hit carries `session_id` and `engagement_time_msec`.
- `timestamp_micros` is sent only for events up to 72 hours old. Older or future events are sent without it and GA4 records them at receipt time.
- `googleAdsConsent: 'marketing'` maps the event's marketing consent to `ad_user_data` and `ad_personalization`. The default sends both as `DENIED`.
- `debug: true` posts to the validation endpoint and treats any validation message as a failure. Nothing is recorded, so use it in sandboxes.
- A 2xx from the live endpoint means the request was received, not that GA4 accepted or attributed the event. Check DebugView.

Recipe (decision D5): when Measurement Protocol is enabled, GA4 `purchase` is sent from the server only. Dispatch the browser copy to every configured browser provider except `ga4`, by name, so the browser GA4 adapter does not also send it and Clarity and the Meta Pixel still receive it:

```ts
// Browser, after the host confirms the order. List every browser provider you configure except 'ga4':
const serverOwnsGa4 = order.ga4ServerReady; // host-computed, see below
await signals.track(purchase, serverOwnsGa4 ? { providers: ['meta-pixel', 'clarity'] } : undefined);
// Server, from verified state, using ids captured with getProviderIds():
await server.track(purchase, { consent: order.consent, context: order.context });
```

Withhold the browser GA4 copy only when the server copy will actually be sent: the `ga4-mp` provider is configured (API secret present), the order has a stored GA4 `client_id`, and analytics consent was recorded with the order. Otherwise send the purchase from the browser to every provider, GA4 included. The host decides this from its own state; the SDK does not know whether a server copy will follow. Clarity is a browser-only provider: send its copy from the browser after the host confirms the order. The earlier form of this recipe, `categories: ['marketing']`, also withholds `purchase` from Clarity and any other analytics provider, because they share the `analytics` category with GA4; use `providers` instead. A name list is explicit, so a browser provider added later receives nothing from this call until you add its name.

Both copies share `eventId` and `transaction_id`. GA4 deduplicates purchases by `transaction_id`; do not depend on `event_id`.

## Outbox rule for delayed sends

Store the paid-at time with the order, pass it as the event `timestamp`, and reuse it on every retry. Treat `sent`, `skipped` and `denied` as terminal for that provider copy. Retry `failed`. Park `dropped` and `invalid` for a person, because retrying does not change them. Vendors limit how old a server event can be (Meta documents seven days; GA4 Measurement Protocol accepts backdating up to 72 hours, which the provider enforces by omitting older timestamps). The Bun lab (`examples/bun/src/index.ts`) follows this: it stores `paid_at`, a consent snapshot and the GA4 ids with the order, sends with per-call `consent` and `context`, records each provider's terminal outcome, retries only the providers not yet done by naming them in `providers` (not `categories`, which would re-send to a finished provider sharing a category), and flags rows that need attention. It is a fixture, not a production queue.

## Evidence for this change

Everything above is fixture evidence: contracts, core, browser jsdom, injected-transport server tests and local Playwright runs. None of it has been verified against a live GA4 property or Meta account. GA4 DebugView is still required for the `gtag` command fix (the stub now pushes `arguments`, as Google's snippet does; it previously pushed an array that gtag.js may ignore), `user_id`, consent-time attribution and Measurement Protocol acceptance. Meta Test Events is still required for deduplication, `AddPaymentInfo` and `AddToWishlist`.

## Attribution: UTMs, ad click IDs and search sources

The GA4 adapter sends page_location with the origin, redacted path and only utm_source/medium/campaign/term/content/id, gclid, gbraid, wbraid, msclkid and fbclid, plus page_referrer as the referrer origin, so GA4 channel grouping, Google Ads auto-tagging and the Search Console link work. All other query parameters and the referrer path and query stay out. The path is passed through `safeRoute`, a heuristic rather than a guarantee: numeric, UUID, MongoDB ObjectId, Stripe-style and CUID segments become `:id`, segments containing `@` or longer than 64 characters become `:redacted`, and every other segment (for example `/reset/secret-code`) is kept as is. Keep secrets, tokens and personal data out of path segments, or pass a route template so GA4 only sees the template.

Opt in to first-party visit-source capture with `attribution: true` or `attribution: { category: 'marketing', maxAgeDays: 90 }` in the browser/Next/SvelteKit config. The SDK reads the landing URL and referrer once at start, before your router rewrites them, classifies the visit (paid_search, paid_social, paid_other, organic_search, ai_search, organic_social, email, referral, direct, other) and keeps first/last touch in localStorage only while that consent category is granted. `signals.getAttribution()` returns `{}` while the category is denied, so the host no longer needs its own consent guard; the in-memory landing touch is kept and persisted if consent is granted later. When granted it returns `{ first, last }` with channel, source, medium, campaign, campaignId, term (utm_term={keyword} from Google/Microsoft Ads), content, clickIds, landingPath, referrerHost and timestamp; store it with your own order. `metaClickCookie(fbclid)` builds the `fbc` value for the Meta CAPI `context.meta.userData`; `getProviderIds()` already falls back to it when no `_fbc` cookie exists. Organic search keywords are never in the URL: read them from `/server/search-console` (createGoogleSearchConsoleClient with a host-owned OAuth token, createBingWebmasterClient with an API key, mergeSearchRows). Full tutorial, routing/rendering rules and no-code platform settings: [ads, UTM and search attribution guide](../../../docs/growth/articles/ads-utm-search-attribution.md).

`auditAttribution({ signals })` from `@techinject/browser` (re-exported by `@techinject/nextjs` and `@techinject/sveltekit`) is a development self-check for the integration mistakes the guide describes. It is synchronous, framework-independent, never throws and makes no network request; it returns findings with stable ids (`attribution-disabled`, `params-dropped-by-redirect`, `params-removed-before-capture`, `canonical-has-tracking-params`, `csp-blocks-vendor`, `storage-unavailable`, `consent-never-granted`, `multiple-sdk-instances`), a severity and a hint. Run it after `start()` on the real landing URL; it only sees a meta-tag CSP, and `expectedHosts` adds script hosts the policy must allow. `signals.isAttributionEnabled()`, `signals.getAttributionCategory()` and `signals.isAttributionCaptured()` expose the configuration and capture state it reads. `isAttributionCaptured()` is true when a visit source was captured whether or not consent is granted, so the `params-removed-before-capture` finding stays correct while `getAttribution()` is empty.

## Development

Bun 1.4.4 or newer. bun install --frozen-lockfile; bun run build; bun run test; bun run typecheck; bun run test:boundaries. Use `bun run dev` for Next, `bun run dev:bun` for Bun, or `bun run dev:all` for all local hosts through Turbo. Modern browser required; exact verified versions in compatibility doc. Upgrade owner is maintainer; verify leaf packages and both consumer hosts.

## Technical references

[Next instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation), [Next OpenTelemetry](https://nextjs.org/docs/app/guides/open-telemetry), [Bun server](https://bun.sh/docs/runtime/http/server), [OTLP exporters](https://opentelemetry.io/docs/languages/js/exporters/), [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/). Follow current provider documentation before enabling a live account; recorded fixture evidence is separate.

[SvelteKit guide](https://techinjectindia.github.io/signal-kit/docs/sveltekit/) · [SvelteKit local lab](../../../examples/sveltekit/README.md)

## In-app connections dashboard

The optional browser renderer mounts against an existing SDK instance. See [dashboard setup](../../../docs/CONNECTIONS-DASHBOARD.md) for full Next.js and SvelteKit /connections routes, Bun server snapshots, portable HTML/JavaScript wiring, and the coming-soon status for all 14 planned platforms. The Next lab includes `/connections`.

[Public dashboard setup guide](https://techinjectindia.github.io/signal-kit/docs/connections/) covers opening the route, status meanings, styling, consent checks and authentication. Technical observers and provider account health are not included.

## Versioning and upgrades — all frameworks

See [UPGRADING.md](../../../docs/UPGRADING.md) for exact package versions, Next.js/SvelteKit/Bun commands, source updates, CDN imports, rollback and all coming-soon platforms. Existing deployments do not automatically fetch SDK changes. All nine npm packages and the browser CDN module are verified at version `0.1.0-alpha.4`.

## Observability backends (unreleased)

See [observability setup](../../../docs/CLOUD-OBSERVABILITY.md) for configuring the existing OTLP exporter against local/cloud SigNoz or Grafana-compatible ingestion, adding the host-owned Sentry bridge, combining observers and completing serverless exports. New Sentry/composition helpers are server-only and not yet published.
