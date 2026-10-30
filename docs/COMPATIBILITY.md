# Compatibility and evidence

SDK v1 local implementation, 2026-10-05. All nine packages are published on npm as `0.1.0-alpha.2` (`alpha` tag); `latest` still points to `0.1.0-alpha.1`. Peer ranges are integration declarations, not proof of every version in range.

| Target                            | Recorded version                               | Evidence                                                                     |
| --------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Tooling                           | Node22.21.1, pnpm10.24.0, TS5.9.3, Turbo2.11.7 | workspace builds/typechecks                                                  |
| Bun                               | 1.3.4 macOS arm64                              | real Bun.serve socket, inbound trace, signed synthetic payment/restart tests |
| Next App Router Node              | 16.4.1, React19.3.0                            | production build, browser runtime and local OTel recorder                    |
| Modern Chromium                   | Playwright pinned lockfile browser             | navigation/consent/API/commerce fixture                                      |
| GA4/Meta Pixel/Clarity            | public SDK interfaces                          | jsdom command/script fixtures; no provider sandbox/live proof                |
| Meta CAPI                         | caller selects explicit Graph API version      | injected HTTP acceptance/rejection fixtures only                             |
| OTLP HTTP JSON                    | standard trace envelope                        | JSON transport/rejection/consent tests; no SigNoz deployment proof           |
| Next Edge                         | unsupported                                    | not tested                                                                   |
| Hono/Astro/HTML integration hosts | future                                         | generic browser/server contracts only; no compatibility claim                |
| Django/Laravel                    | future native adapters                         | no implementation                                                            |

Requirements: modern browser crypto.randomUUID, structuredClone, fetch/Headers, URL and performance. SSR import/start guards supported. Outbound server instrumentation is signals.fetch, not global Node/Bun fetch. Browser JS error/rejection capture is outside the v1 request telemetry contract; the optional Next request-error hook is separate. Declarative Bun routes are supported via `instrumentBunRoutes`. The declared peer ranges are SvelteKit >=3 <4 and Next.js >=15 <17; only the recorded versions above have consumer runtime evidence.

The workspace uses Node 22 via `.nvmrc` and CI. The `server`, `nextjs-server` and `sveltekit-server` packages declare `engines.node: ">=22"` because Bun 1.3.11 reports `process.version` as `v24.3.0`; a `<23` bound rejects Bun consumers. This engine range is an installation constraint, not runtime verification for Node 23 or later. The recorded Node runtime evidence remains Node 22.

Counts, commands, graph and local runtime outcomes are recorded in the build report. Setup-time usability, independent developer onboarding and live provider dedup/attribution remain release gates. No synthetic test should be described as live tracking verification.

Turbo dry-run graphs verify that each root `dev` script selects its intended host and `dev:all` selects the four runnable hosts. The direct Turbo JSON boundary check verifies the build graphs without parsing pnpm output. These are local tooling checks, not additional platform runtime evidence.

Contracts unit tests verify that `add_to_cart`, `begin_checkout`, and `purchase` reject an empty `items` array while `product_view` accepts it. This is schema evidence, not live GA4 or Meta delivery evidence.

On Node 22.23.4, the repository, formatting, build, typecheck, unit/runtime test, boundary and two Chromium end-to-end checks passed locally. Browser unit tests verify that query-only navigation does not add a page view, even if a caller passes the removed `trackQuery` property at runtime. These checks do not verify provider-side delivery.

Contracts tests verify that synthetic email- and phone-like values in review-extension free-text fields are rejected before dispatch, while ordinary search text remains valid. This pattern check does not prove detection of every kind of personal data.

Core route tests verify that an encoded slash stays within its original path segment after sanitation.

Core route tests verify that numeric product and blog slugs remain distinct, while hosts can pass a route template for an order reference. This is unit-level sanitation evidence, not a claim that arbitrary sensitive slugs can be detected.

Standalone browser tests verify that missing or invalid declarative click attributes are dropped with value-free diagnostics, explicit values reach the provider, and absent product-view quantity is omitted.

Standalone browser tests verify that all categories remain denied with and without the former `data-auto-consent="true"` attribute; provider events begin only after the host calls `setConsent`. These are simulated provider calls, not live vendor delivery evidence.

Browser observer capacity tests verify that a 33rd pending record is dropped without a synthetic `onDiagnostic` event/provider result.

The Next.js lab smoke test checks that its browser shell reads fake public IDs from the root config without a GA4 environment lookup or server credentials. Its browser demo configures all three external adapters; the SvelteKit lab keeps them disabled by default. Browser tests verify three-provider dispatch, shared SDK event ID and mapped calls with simulated script loads. These checks are not live GA4, Meta or Clarity verification.

Meta CAPI injected-transport tests verify that only prehashed SHA-256 `em`, `ph` and `external_id` (or validated cookies) reach the payload. Plaintext and extra matching fields are rejected, and the case-sensitive external ID hash is passed through. Live match quality remains unverified.

Server tests verify that relative fetch trace propagation requires `traceRelative: true`; magic `traceOrigins` entries do not enable it, and absolute third-party origins remain denied.

All exported browser adapters bundled with esbuild: 31,464 bytes minified / 10,625 bytes gzip. Engineering guard: <=30,000 bytes gzip (measurement excludes downloaded vendor scripts and React).

## SvelteKit runtime evidence

Local production build/runtime verified on Node 22.21.1: SvelteKit 3.0.1, Svelte 5.57.2, adapter-node 6.0.0, Vite 8.3.4, plugin 7.3.1 and fixture TypeScript 6.0.3. SSR/hydration, SPA navigation, consent withdrawal, cart/API capture and internal-fetch trace correlation pass. Kit 2 remains unverified; a mocked route-event test does not establish runtime compatibility. Edge and live providers are not verified. Browser and Node server packages are separate. No npm publication performed.

## In-app connections dashboard — 12 October 2026

Core status snapshots/subscriptions and optional browser/dashboard renderer verified with denied consent, successful/failed/timeout/invalid outcomes, duplicate names, safe text rendering and teardown. Next production /connections page verified in Chromium at 390px with real consent changes and SDK send outcomes. Event providers only, per-instance in-memory counts; technical Observer health, cross-request aggregation and vendor delivery/attribution are unverified and not represented.

## Observability backends — 13 October 2026 (unreleased)

The same OTLP HTTP JSON trace exporter supports configurable local/cloud endpoints and authentication. Synthetic tests cover local SigNoz/Tempo and cloud SigNoz/Grafana destinations; no separate cloud implementation is required. Sentry uses a host-injected captureEvent/flush bridge tested with synthetic clients. Composition tests cover independent payload copies, consent, failure isolation and bounded flush.

Workspace build, typecheck, tests (including the local Bun runtime), repository checks, formatting and dependency boundaries were verified on Node 22.21.1. Live Grafana/SigNoz ingestion, native Sentry SDK certification and deployed Firebase/Vercel behavior remain unverified. See [setup guide](CLOUD-OBSERVABILITY.md).

## Local observability catalog verification

Next.js and SvelteKit production-browser tests pass with Sentry, Grafana and SigNoz shown as not configured. Existing consent/outcome updates and cleanup remain verified; Next mobile checks confirm no horizontal overflow at 390px. Browser unit tests cover fixed labels, safe metadata and configured-but-unverified states. Workspace build, typecheck, tests, formatting, repository and boundary checks pass on Node 22.21.1. These cards are configuration summaries, not live backend verification.
