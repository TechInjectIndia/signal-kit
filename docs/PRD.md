# SignalKit product requirements

Status: Build baseline. Scope recorded from founder decisions and explicit end-to-end build authorization on 2026-10-05. Detailed implementation defaults are documented engineering decisions, not separately approved product requirements.
Owner: SignalKit maintainer team / Sumeet Singh.

## Goal and users

Reduce repeated ecommerce instrumentation and debugging effort for developers. Priorities: internal delivery savings, agency credibility/leads, direct revenue, then OSS recognition.

## Agreed scope

- Open-source, platform-independent design; first integrations are Next.js and Bun servers.
- Automatic initial page/navigation tracking and supported browser/server API instrumentation.
- Explicit typed product_view, add_to_cart, begin_checkout, and purchase events.
- GA4 and Meta Pixel/CAPI; optional Clarity and OTel/OTLP correlation.
- Consent integration, safe payloads, consistent event IDs, failure isolation, and useful diagnostics.
- Razorpay payment/webhook example; the SDK does not become a payment processor.

## Core journeys

1. Developer selects providers, configures public/server settings separately, and supplies consent state.
2. Developer initializes once per runtime; supported technical activity is captured without per-route calls.
3. Application emits business events using a consistent contract.
4. Host verifies purchase and controls persistent idempotency; browser/server copies share one event ID.
5. Developer inspects validation, routing, consent, and dispatch, then verifies provider behavior separately.

## Product rules

- Route page/business analytics to marketing providers; route request/error telemetry to observability.
- Do not infer purchase from a page URL or HTTP 200.
- Never use trace IDs as purchase deduplication keys. Webhooks may begin new traces.
- Default exclusion of request/response bodies, credentials, query strings, and raw PII.
- Normalize dynamic request routes. Exclude telemetry endpoints to avoid capture loops.
- Propagate trace context only to allowlisted application origins.
- Respect consent changes and document pending-event behavior before implementation.
- Tracking failures must not break checkout; bounded resources and visible outcomes are required.
- Avoid duplicate page views, duplicate instrumentation, and conflicts with existing OTel.

## Non-goals for first release

Hosted dashboards, hosted collection service, universal identity/group APIs, extra ad networks, native Python/PHP SDKs, and unverified edge support.

## Acceptance evidence required before release

- Next.js initial and client-navigation page views each emit once when configured and consented.
- Bun incoming requests record safe normalized route, method, status, and duration.
- Failed browser/server requests are observable without unsafe payloads.
- Allowed browser-to-server trace propagation works; denied origins receive no added context.
- Verified purchase mapping preserves event IDs through browser/server copies and retries.
- Host idempotency example prevents repeated business emissions across webhook replays.
- Consent denial/withdrawal, invalid data, provider rejection, and blocked scripts have explicit outcomes.
- Another developer can install from documentation with recorded time and assistance.
- Tests state whether they are contract, runtime, sandbox, or live-provider evidence.

## Implementation defaults and remaining evidence

Implemented defaults: three denied-by-default consent categories, dropped preconsent events with no replay, bounded best-effort dispatch, explicit typed business events, automatic page/fetch/XHR tracking, and separate browser/server adapters. Packages use the owner-selected `@techinject` scope and are published as npm alphas. See architecture, FRD, compatibility and integration guide for exact behavior. Live provider delivery/attribution, real SigNoz collector ingestion, independent developer setup-time remain release evidence requirements. Browser SDK bundle now has a measured 30kB gzip budget; see compatibility.

## Implemented review extension — pending product acceptance

The SDK keeps nine predefined events: `page_view`, `product_view`, `add_to_cart`, `begin_checkout`, `purchase`, `generate_lead`, `search`, `sign_up` and `login`. Consumer-defined events are registered once at the app root through `defineEvent` and `createSignals({ events: [...] })`; `phone_click`, `whatsapp_click` and generic `custom_event` are app-owned examples. Contact events may carry a non-identifying `channel` (`phone` or `whatsapp`); event contracts exclude raw phone numbers, destinations, and user IDs. Purchases still originate from verified server state, not a browser button. The B5 LLD was approved for implementation before this registry change.

The consumer-defined `custom_event` example maps a validated, non-identifying `action` name across GA4, Meta Pixel/CAPI and Clarity. The local Next lab shows each configured provider's SDK outcome using fake public IDs; those outcomes are not provider delivery or attribution proof.

The review-extension free-text fields reject email- and phone-like values before provider dispatch. Hosts must use non-identifying labels and avoid sending other personal data in event fields.

The PR also adds a Bun declarative-routes wrapper and an experimental standalone browser bundle. The Bun host must pass its routes table through the wrapper to capture those handlers. The browser bundle starts with all consent categories denied; the host consent banner applies the visitor's choices through `window.signals.setConsent(...)`. No script attribute grants consent. Automatic hash-route tracking is opt-in and only recognizes `#/` and `#!/` routes. Ordinary anchors do not create page views. Provider URL metadata drops query strings and fragments by default; forwarding attribution parameters requires a separate product decision. These behaviors do not extend verified platform support beyond the compatibility matrix.

## Public website amendment — 2026-10-06

User authorized a static site for organic discovery. Developer visitors should understand what SignalKit is, supported use cases, how to try it, provider/consent boundaries and current evidence. Public overview, quickstart, integrations and FAQ are crawlable complete HTML with metadata and semantic structured data. Search rankings, indexing and generated-answer citations are not promised. Public canonical URL remains owner-configurable. Local labs remain noindex. No lead form, account, tracking scripts or new backend is needed.

## SvelteKit adapter extension

Owner-authorized addition, 12 October 2026: separate SSR-safe browser lifecycle and Node server-hook packages, plus a SvelteKit 3/Svelte 5 consumer lab. Browser mount/dispose retains consent/page/request semantics. Server handle/handleFetch uses route templates, isolated per-request config and framework fetch transport. Preserve responses, errors and browser/server import boundaries; no new hosted application or provider support. Node only; Kit 2/Edge remain unverified. Acceptance: leaf tests, independent package exports, browser boundary, real production SSR/navigation/consent/API trace checks.

## Host connections dashboard — 12 October 2026

Owner requested a simple dashboard inside each consuming app. Reuse the existing SDK instance: core exposes copied connection snapshots and isolated subscriptions; an optional browser/dashboard subpath renders them without polling or provider probes. Show event-provider configuration, current consent, bounded aggregate counters, latest SDK outcome and time. Never retain payloads, event IDs, raw errors, endpoints or credentials. Configuration is not connectivity; completed sends do not prove delivery or attribution. Counts are per instance, in memory; technical Observer status and cross-request/server aggregation are outside this first version. The host owns authentication and any server-to-browser snapshot endpoint. Next lab includes a noindex /connections consumer page. Verify failure/timeout/denial, duplicate names, mutation isolation, cleanup, safe rendering and real mobile navigation.

## Observability backend extension — 13 October 2026

Owner requested Sentry and Grafana support, clarifying that cloud and self-hosted deployments should share one implementation. Use the existing generic OTLP trace exporter for SigNoz and Grafana-compatible backends with host-configured endpoints and authentication headers. Add a separate Sentry error bridge and observer composition; do not introduce cloud-specific SDK factories.

Maintain consent controls, bounded exports, isolated failures and server-only credentials. Preserve the exclusion of raw exception messages, stacks, request bodies and user data. Host-owned Sentry instrumentation remains separate from SignalKit-controlled events. Test local/cloud endpoint and header mapping, safe event construction, lifecycle and export deadlines. Account provisioning, live ingestion, deployment and npm publication are outside this change.

## Local connections observability catalog — 13 October 2026

Owner requested visibility of the new integrations on the local /connections page. The portable dashboard accepts optional host-declared observability metadata and renders Sentry, Grafana and SigNoz separately from event-provider outcomes. Next.js and SvelteKit labs list these as not configured because their observers are synthetic. Backend labels and setup guidance are fixed, while configuration/policy flags are supplied by the host. No credentials, endpoints, provider objects, health probes or invented delivery counters are exposed. Existing two-argument dashboard calls remain supported. Configuration is unverified host information, not evidence of a connection.

Consumer-defined events share schema validation, unknown-field stripping, privacy checks, consent, bounded dispatch, event IDs and provider fan-out with predefined events. Definitions cannot override predefined events or impersonate their provider names. A configured consented provider without a consumer mapping reports an explicit invalid outcome. No denied event is replayed.
