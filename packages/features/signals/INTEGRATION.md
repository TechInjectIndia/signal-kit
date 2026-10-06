# SignalKit integration

These packages are local workspace packages, not yet available on npm. Build the cloned repo first. ESM exports/declarations live in each dist directory. Pack them with pnpm pack to test outside this workspace; do not publish before the release checklist.

## Next.js browser

```tsx
'use client';
import { SignalKitProvider, createGA4Provider, createMetaPixelProvider } from '@signalkit/nextjs';
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

Install/use @signalkit/nextjs-server separately from browser package. In instrumentation.ts:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SIGNALKIT_OTEL_ENABLED === 'true') {
    const { registerNextInstrumentation } = await import('@signalkit/nextjs-server');
    registerNextInstrumentation({ serviceName: 'your-service' });
  }
}
```

Configure OTEL_EXPORTER_OTLP_ENDPOINT/host credentials and collector filters. This is host-owned global OTel; SignalKit consent does not control it. Preserve an existing provider instead of registering another. Next's default spans cover framework requests; outbound calls use createNextSignals().fetch when you need this SDK's correlation. Supplemental createNextRequestErrorHandler(observer,{enabled:()=>hostAllowsTechnicalTelemetry}) can be exported as onRequestError. No raw exception text/headers included. Next Edge deferred.

## Bun server

```ts
import { createServerSignals, createOTLPObserver } from '@signalkit/server';
import { instrumentBunFetch } from '@signalkit/bun';
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

Wrap every Bun routes-table handler too: routes bypass fallback fetch. Supply routeResolver for arbitrary dynamic/sensitive slugs. Use signals.fetch for outbound calls; global fetch is untouched. Call flush on shutdown before dispose with your host shutdown budget. Configure observer errors/onDiagnostic for overload/rejection visibility. OTLP HTTP JSON works with collectors configured for that protocol; SigNoz examples require collector deployment/credentials and are not live-tested here.

## Verified purchase and provider delivery

Store eventId with the trusted host order. Browser and server copies both emit purchase using same eventId and transaction_id. Verify payment signatures and captured/paid state against trusted order currency/amount; never trust a client success page. The Bun example shows raw HMAC and a durable local SQLite outbox with replay tests. Production applications supply their own persistence, per-user consent, signed webhook rotation, currency exponents and order line items.

createMetaCapiProvider requires pixelId, accessToken, explicit supported apiVersion, eventSourceUrl and userData callback with SHA-256 hashed em/ph/external_id or validated fbp/fbc. It deliberately refuses arbitrary matching fields. Hashes remain personal data; host supplies consent/retention policy. No access token belongs browser config. A stable event ID enables Meta dedup but actual matching/dedup is unverified until sandbox/live tests.

Default denied consent drops data without replay; resource limits drop overload. Custom providers should honour AbortSignal and implement setConsent/dispose. Telemetry delivery is best effort; persisted outbox/retry belongs host. Safe route heuristics cannot remove every sensitive pathname: supply templates/exclusions and avoid PII in named commerce fields. External scripts can inspect host URL/DOM/cookies independently.

## Development

Node22 + pnpm10.24.0, Bun1.3.4 for runtime fixture. pnpm install --frozen-lockfile; pnpm build; pnpm test; pnpm typecheck; pnpm test:boundaries. pnpm --filter @signalkit/example-nextjs dev or pnpm --filter @signalkit/example-bun dev. Modern browser required; exact verified versions in compatibility doc. Upgrade owner is maintainer; verify leaf packages and both consumer hosts.

## Technical references

[Next instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation), [Next OpenTelemetry](https://nextjs.org/docs/app/guides/open-telemetry), [Bun server](https://bun.sh/docs/runtime/http/server), [OTLP exporters](https://opentelemetry.io/docs/languages/js/exporters/), [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/). Follow current provider documentation before enabling a live account; recorded fixture evidence is separate.
