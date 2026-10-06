# SignalKit

A consent-aware ecommerce telemetry SDK for Next.js and Bun. Shared typed events, automatic page/request instrumentation and provider adapters, with a platform-independent core.

**Status: alpha candidate `0.1.0-alpha.1`, not yet published to npm.** Tested runtime evidence and limits are listed in [compatibility](docs/COMPATIBILITY.md). No hosted dashboard or collector required by the SDK.

[![SignalKit demo: consent, navigation, cart and API outcomes](docs/assets/demo.gif)](https://techinjectindia.github.io/signal-kit/demo.mp4)

The clip uses local recorders: grant consent, navigate, add to cart, call an API, then withdraw consent. No advertising provider receives these demo events.

[Website](https://techinjectindia.github.io/signal-kit/) · [Technical guides](https://techinjectindia.github.io/signal-kit/guides/) · [First contributions](https://github.com/TechInjectIndia/signal-kit/labels/good%20first%20issue)

## Try the local labs

```sh
# Node 22, pnpm 10.24.0, Bun 1.3.4 for Bun fixture
git clone --branch main https://github.com/TechInjectIndia/signal-kit.git
cd signal-kit
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @signalkit/example-nextjs dev
# http://localhost:3100 — consent controls and local inspector
pnpm --filter @signalkit/example-bun dev
# http://localhost:3200 — API and signed payment fixture
```

The examples use local recorders and synthetic data. The Next lab starts with all consent denied. The Bun fixture uses synthetic host consent and SQLite order/outbox persistence; real hosts supply their own order state and consent.

## What is included

- Typed product_view, add_to_cart, begin_checkout and purchase events; runtime payload validation.
- Browser initial/navigation pages and fetch/XHR failures, status and duration.
- Bun incoming handler and server outbound fetch instrumentation with trace correlation.
- Next React root provider and separate Node OpenTelemetry registration for automatic framework requests.
- GA4, Meta Pixel/CAPI stable event IDs, optional Clarity and OTLP HTTP JSON.
- Denied consent defaults, withdrawal hooks, safe fields/routes, bounded dispatch and per-provider diagnostics.
- Signed Razorpay reference webhook, trusted order checks and durable replay-tested outbox.

Marketing providers receive page/business events; technical requests go to configured observability. Purchases must come from verified host state. Runtime tracking is best effort; the host owns consent, durable retry and business correctness. Third-party scripts require their own privacy/masking settings. No credentials belong browser configuration.

```ts
await signals.track({
  name: 'purchase',
  eventId: persistedOrder.eventId,
  properties: {
    transaction_id: persistedOrder.id,
    currency: 'INR',
    value: 450,
    items: [{ item_id: 'notebook', price: 450, quantity: 1 }],
  },
});
```

Package names @signalkit/\* are provisional and not reserved/published. Install from the workspace or locally packed tarballs. See [integration guide](packages/features/signals/INTEGRATION.md) for exact Next/Bun wiring, provider settings and limitations.

## Verify and contribute

```sh
pnpm check
pnpm format:check
pnpm build
pnpm typecheck
pnpm test
pnpm test:boundaries
pnpm test:packages
pnpm test:bundle
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:next-otel
```

Local socket tests require permission to listen on localhost. Each leaf owns build, types and tests. Root Turbo delegates and caches builds; runtime tests are uncached. Prettier enforces consistent source and documentation formatting; the text-format script remains available for basic text hygiene. Read [contributing](CONTRIBUTING.md), [maintenance](docs/MAINTAINING.md) and [governance](GOVERNANCE.md).

[PRD](docs/PRD.md) · [architecture](docs/ARCHITECTURE.md) · [FRD](docs/frd/signals.md) · [design](packages/features/signals/DESIGN.md) · [roadmap](docs/ROADMAP.md)

Report bugs through issue templates. For vulnerabilities use [private vulnerability reporting](https://github.com/TechInjectIndia/signal-kit/security/advisories/new); never post credentials or customer payloads. [Security policy](SECURITY.md) · [support](SUPPORT.md) · [code of conduct](CODE_OF_CONDUCT.md)

MIT licensed. GA4/Meta/Clarity and collector accounts remain governed by their providers' terms. No live attribution, provider dedup or universal framework support claim.

## Public website

[SignalKit website](https://techinjectindia.github.io/signal-kit/) explains the SDK, quickstart, integrations and FAQs. Static HTML/CSS source lives in apps/site, separate from the local noindex lab. Build/preview with pnpm --filter @signalkit/site build/dev. See [site operations](docs/PUBLIC-SITE.md) for canonical URL, deployment and discovery details.

## Alpha and pilot participation

[Alpha review and install plan](docs/releases/0.1.0-alpha.1.md) · [Pilot developer handoff](docs/growth/PILOT-GUIDE.md) · [Maintenance routine](docs/growth/MAINTAINER-SOP.md). Report a concrete installation problem; stars are welcome, but real usage and useful feedback matter more.
