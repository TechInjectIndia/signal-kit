# Compatibility and evidence

SDK v1 local implementation, 2026-10-05. All nine packages are published on npm as `0.1.0-alpha.6` (`alpha` tag; `latest` follows the newest alpha until the first stable release). Peer ranges are integration declarations, not proof of every version in range.

| Target                            | Recorded version                                  | Evidence                                                                     |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Contributor tooling               | Bun1.4.4, TS5.9.3, Turbo2.11.7                    | workspace builds/typechecks/tests on Bun; see Bun toolchain section          |
| Bun                               | 1.4.4 macOS arm64                                 | real Bun.serve socket, inbound trace, signed synthetic payment/restart tests |
| Client package managers           | Node22.21.1 npm/pnpm10.24.0/yarn1.22.22, Bun1.4.4 | packed tarballs install and import; Next 16.4.1 build on npm and pnpm        |
| Next App Router Node              | 16.4.1, React19.3.0                               | production build, browser runtime and local OTel recorder                    |
| Modern Chromium                   | Playwright pinned lockfile browser                | navigation/consent/API/commerce fixture                                      |
| GA4/Meta Pixel/Clarity            | public SDK interfaces                             | jsdom command/script fixtures; no provider sandbox/live proof                |
| Meta CAPI                         | caller selects explicit Graph API version         | injected HTTP acceptance/rejection fixtures only                             |
| OTLP HTTP JSON                    | standard trace envelope                           | JSON transport/rejection/consent tests; no SigNoz deployment proof           |
| Next Edge                         | unsupported                                       | not tested                                                                   |
| Hono/Astro/HTML integration hosts | future                                            | generic browser/server contracts only; no compatibility claim                |
| Django/Laravel                    | future native adapters                            | no implementation                                                            |

Requirements: modern browser crypto.randomUUID, structuredClone, fetch/Headers, URL and performance. SSR import/start guards supported. Outbound server instrumentation is signals.fetch, not global Node/Bun fetch. Browser JS error/rejection capture is outside the v1 request telemetry contract; the optional Next request-error hook is separate. Declarative Bun routes are supported via `instrumentBunRoutes`. The declared peer ranges are SvelteKit >=3 <4 and Next.js >=15 <17; only the recorded versions above have consumer runtime evidence.

The workspace uses Node 22 via `.nvmrc` and CI. The `server`, `nextjs-server` and `sveltekit-server` packages declare `engines.node: ">=22"` because Bun 1.3.11 reports `process.version` as `v24.3.0`; a `<23` bound rejects Bun consumers. This engine range is an installation constraint, not runtime verification for Node 23 or later. The recorded Node runtime evidence remains Node 22.

Counts, commands, graph and local runtime outcomes are recorded in the build report. Setup-time usability, independent developer onboarding and live provider dedup/attribution remain release gates. No synthetic test should be described as live tracking verification.

Turbo dry-run graphs verify that each root `dev` script selects its intended host and `dev:all` selects the four runnable hosts. The direct Turbo JSON boundary check verifies the build graphs without parsing package-manager output. These are local tooling checks, not additional platform runtime evidence.

Contracts unit tests verify that the cart, checkout, list and purchase events reject an empty `items` array while `product_view` accepts it (and `refund` may omit items). This is schema evidence, not live GA4 or Meta delivery evidence.

On Node 22.23.4, the repository, formatting, build, typecheck, unit/runtime test, boundary and two Chromium end-to-end checks passed locally. Browser unit tests verify that query-only navigation does not add a page view, even if a caller passes the removed `trackQuery` property at runtime. These checks do not verify provider-side delivery.

Contracts tests verify that synthetic email- and phone-like values in review-extension free-text fields are rejected before dispatch, while ordinary search text remains valid. This pattern check does not prove detection of every kind of personal data.

Core route tests verify that an encoded slash stays within its original path segment after sanitation.

Core route tests verify that numeric product and blog slugs remain distinct, while hosts can pass a route template for an order reference. This is unit-level sanitation evidence, not a claim that arbitrary sensitive slugs can be detected.

Standalone browser tests verify that missing or invalid declarative click attributes are dropped with value-free diagnostics, explicit values reach the provider, and absent product-view quantity is omitted.

Standalone browser tests verify that all categories remain denied with and without the former `data-auto-consent="true"` attribute; provider events begin only after the host calls `setConsent`. These are simulated provider calls, not live vendor delivery evidence.

Browser observer capacity tests verify that a 33rd pending record is dropped without a synthetic `onDiagnostic` event/provider result.

The Next.js lab smoke test checks that its browser shell reads fake public IDs from the root config without a GA4 environment lookup or server credentials. Its browser demo configures all three external adapters; the SvelteKit lab keeps them disabled by default. Browser tests verify three-provider dispatch, shared SDK event ID and mapped calls with simulated script loads. These checks are not live GA4, Meta or Clarity verification.

GA4 jsdom command tests cover denied defaults before measurement, the safe default that updates only analytics storage for existing marketing-consented hosts, explicit `googleAdsConsent: 'marketing'` opt-in, marketing-only consent queuing no GA4 command, saved granted and analytics-only choices before the first event, marketing consent changes, unchanged `setConsent` calls, and repeated events without extra updates. Pending-script tests withdraw consent or dispose the adapter before simulating a late script load; neither path queues an event after revocation. A reuse test disposes one SDK and mounts a second with the same GA4 provider object; the second sends after a fresh granted update. This verifies queued adapter commands and local dispatch only, not Google tag processing or live delivery.

Meta CAPI injected-transport tests verify that only prehashed SHA-256 `em`, `ph` and `external_id` (or validated cookies) reach the payload. Plaintext and extra matching fields are rejected, and the case-sensitive external ID hash is passed through. Live match quality remains unverified.

Server tests verify that relative fetch trace propagation requires `traceRelative: true`; magic `traceOrigins` entries do not enable it, and absolute third-party origins remain denied.

All exported browser adapters bundled with esbuild: 53,478 bytes minified / 18,397 bytes gzip (4 November 2026, including the event registry, attribution capture and the attribution self-check). Engineering guard: <=30,000 bytes gzip (measurement excludes downloaded vendor scripts and React).

## SvelteKit runtime evidence

Local production build/runtime verified on Node 22.21.1: SvelteKit 3.0.1, Svelte 5.57.2, adapter-node 6.0.0, Vite 8.3.4, plugin 7.3.1 and fixture TypeScript 6.0.3. SSR/hydration, SPA navigation, consent withdrawal, cart/API capture and internal-fetch trace correlation pass. Kit 2 remains unverified; a mocked route-event test does not establish runtime compatibility. Edge and live providers are not verified. Browser and Node server packages are separate. No npm publication performed.

## In-app connections dashboard — 12 October 2026

Core status snapshots/subscriptions and optional browser/dashboard renderer verified with denied consent, successful/failed/timeout/invalid outcomes, duplicate names, safe text rendering and teardown. Next production /connections page verified in Chromium at 390px with real consent changes and SDK send outcomes. Event providers only, per-instance in-memory counts; technical Observer health, cross-request aggregation and vendor delivery/attribution are unverified and not represented.

## Observability backends — 13 October 2026 (unreleased)

The same OTLP HTTP JSON trace exporter supports configurable local/cloud endpoints and authentication. Synthetic tests cover local SigNoz/Tempo and cloud SigNoz/Grafana destinations; no separate cloud implementation is required. Sentry uses a host-injected captureEvent/flush bridge tested with synthetic clients. Composition tests cover independent payload copies, consent, failure isolation and bounded flush.

Workspace build, typecheck, tests (including the local Bun runtime), repository checks, formatting and dependency boundaries were verified on Node 22.21.1. Live Grafana/SigNoz ingestion, native Sentry SDK certification and deployed Firebase/Vercel behavior remain unverified. See [setup guide](CLOUD-OBSERVABILITY.md).

## Local observability catalog verification

Next.js and SvelteKit production-browser tests pass with Sentry, Grafana and SigNoz shown as not configured. Existing consent/outcome updates and cleanup remain verified; Next mobile checks confirm no horizontal overflow at 390px. Browser unit tests cover fixed labels, safe metadata and configured-but-unverified states. Workspace build, typecheck, tests, formatting, repository and boundary checks pass on Node 22.21.1. These cards are configuration summaries, not live backend verification.

## B5 event registry (0.1.0-alpha.4)

The SDK predefines 17 contracts (the original nine plus eight lifecycle events; see the 19 November 2026 section). Contact and generic custom events are registered consumer definitions in the Next.js, SvelteKit and Bun examples. Contracts tests cover every predefined provider mapping and reject unregistered consumer names. Core registry tests cover nested stripping/privacy, mapping failures, identity, snapshots, consent withdrawal and no replay; compiler assertions check inferred properties and registration. Browser simulated-script tests verify consumer names, projected properties and shared GA4/Meta identity; CAPI uses injected transport. These checks do not establish live vendor delivery.

Final local verification on Node 22.23.4 passed: frozen-lockfile install, repository and formatting checks, workspace build/typecheck/tests (including the Bun socket/webhook fixture), dependency boundaries, both Next.js Chromium tests, the SvelteKit Chromium test and browser bundle guards. The Next runtime test exercises all three consumer examples through the root registry and all three simulated vendor adapters.

## Bun contributor toolchain — 30 October 2026 (unreleased)

The repository's own tooling moved from pnpm to Bun 1.4.4 with Turborepo 2.11.7 (`bun.lock`, `.bun-version`, `bunfig.toml` with `[run] bun = true`). This is internal: published packages keep `engines.node >=22`, declare no Bun engine or package manager, and client apps may use Node with npm, pnpm or yarn, or Bun.

Verified on macOS arm64 with Bun 1.4.4: frozen install, repository/format checks, build, typecheck, 62 Vitest package tests run on Bun, example/site tests under `bun test`, boundaries, Next OTel smoke (19 spans), package and bundle checks, release tests, alpha preparation and installer, and Playwright (Next 2/2 served by Bun, SvelteKit 1/1 on real Node 22, site 3/3). `bun run test:consumers` installed the `bun pm pack` tarballs into npm, pnpm and yarn client apps on Node 22.21.1 (Next 16.4.1 production build on npm and pnpm) and a Bun client.

Bun 1.3.10 cannot build or serve Next.js 16.4.1 (`Expected CommonJS module to have a function wrapper`), so 1.4.4 is the minimum. Native `bun test` is not used for package tests (no DOM; `vi.advanceTimersByTimeAsync` missing). npm publishing stays on `npm publish --provenance` because `bun publish` has no provenance support. A machine without any Node install and the Linux CI run remain to be confirmed by CI.

## Attribution and search sources — 4 November 2026 (unreleased)

GA4 page_location/page_referrer parameters, visit-source classification, consent-gated localStorage persistence and expiry are verified by core and browser jsdom tests and a Next production Playwright landing-source test. Google Search Console and Bing Webmaster clients are verified with injected fetch fixtures only; no live console account, OAuth exchange or GA4 channel report was exercised. Provider-side channel grouping and attribution remain unverified until checked in a real GA4/Ads/Meta account.

Attribution self-check (`auditAttribution`): every finding and a hostile-input never-throws case are verified by browser jsdom tests with injected document/location/performance stubs; the Next production Playwright suite verifies that a `?gclid=test` landing produces no error findings and that an injected canonical link with `utm_source` yields `canonical-has-tracking-params`. Redirect detection, meta CSP parsing and storage probing are exercised with stubs only; no real multi-hop redirect, header-delivered CSP or blocked-storage browser profile was run. Bundle growth from the check is about 2.1 kB gzip.

## Meta CAPI website-event requirements — 4 November 2026 (0.1.0-alpha.4)

Following Meta's customer information and server event parameter documentation, the CAPI adapter now requires `event_source_url` and `client_user_agent` for website events, accepts unhashed `client_ip_address`, and accepts prehashed `fn`, `ln`, `ge`, `db`, `ct`, `st`, `zp` and `country` alongside `em`, `ph` and `external_id`. The SDK still never hashes plaintext. Injected-transport tests cover the payload, rejection of plaintext, unknown keys, invalid IP/user agent, a missing user agent and invalid source URLs. Live Meta acceptance, Event Match Quality and deduplication remain unverified.

## Commerce lifecycle, identity and server GA4 — 19 November 2026 (0.1.0-alpha.6)

Every row below is fixture evidence. No GA4 property, Meta account or Clarity project was used, and nothing here shows that a vendor recorded, matched, deduplicated or attributed an event.

| Behavior                                                                                                                         | Evidence level                                                                                                                                                | Still required                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 17 predefined events, schemas, mappings, `product_view` normalisation, identifier rule                                           | Contracts unit tests                                                                                                                                          | Meta Test Events for `AddPaymentInfo` and `AddToWishlist`                           |
| `skipped` outcome, per-call `consent`/`context`/`categories`/`providers`, option validation, identity fan-out, duplicate warning | Core unit tests                                                                                                                                               | none beyond the above                                                               |
| GA4 `gtag` stub pushing `arguments`                                                                                              | jsdom command fixtures                                                                                                                                        | GA4 DebugView: the previous array push may have left commands unprocessed           |
| GA4 `page_location` from the tracked route; `user_id` and `customer_type`                                                        | jsdom command fixtures                                                                                                                                        | GA4 DebugView                                                                       |
| Clarity `identify`; `prepare()`                                                                                                  | jsdom fixtures with a simulated queue                                                                                                                         | Clarity dashboard check                                                             |
| Pixel `prepare()` and `identifiers()` (`_fbp`, `_fbc`)                                                                           | jsdom fixtures                                                                                                                                                | Meta Test Events. Pixel advanced matching and re-initialisation are not implemented |
| Consent-time page view (`pageOnConsent`), `landingParams`, preload                                                               | jsdom tests; Next Playwright delayed-consent run with stubbed vendor scripts (one GA4 `page_view` on analytics, one Pixel `PageView` on marketing, no repeat) | GA4 DebugView: whether the consent-time hit carries the landing attribution         |
| `getAttribution()` gate, `isAttributionCaptured()`, audit fix                                                                    | jsdom tests; Next Playwright landing-source test                                                                                                              | none                                                                                |
| `getProviderIds`                                                                                                                 | jsdom tests with simulated vendors and cookies                                                                                                                | a real GA4 `client_id` and `session_id` round trip                                  |
| GA4 Measurement Protocol provider                                                                                                | Injected-transport and debug-endpoint fixtures: payload, 72-hour timestamp rule, consent mapping, secret never in errors                                      | GA4 validation server and DebugView acceptance with a real API secret               |
| Meta CAPI per-call context and consent refusal                                                                                   | Injected-transport tests                                                                                                                                      | Meta Test Events                                                                    |
| Next provider layout-effect consent; SvelteKit start order                                                                       | jsdom and component tests                                                                                                                                     | none                                                                                |
| Bun outbox: `paid_at`, consent snapshot, GA4 ids, terminal `sent`/`skipped`/`denied`, retry by provider name                     | Bun runtime test with synthetic orders and an injected collector                                                                                              | A production host queue                                                             |
| GA4 adapter beside a host GTM container (shared `dataLayer`, kept host `gtag`, late `consent default`, `dispose()` denial)       | Unverified. Documented from adapter code only; no GTM container was loaded in any test                                                                        | Tag Assistant: consent ordering with a host container; no duplicate GA4 tag         |

Bundle size for all browser adapters, measured by `bun run test:bundle` on 19 November 2026 for this change set: 66,692 bytes minified, 22,852 bytes gzip, against the 30,000-byte gzip budget.
