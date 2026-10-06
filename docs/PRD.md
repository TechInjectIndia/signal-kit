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

Implemented defaults: three denied-by-default consent categories, dropped preconsent events with no replay, bounded best-effort dispatch, explicit typed business events, automatic page/fetch/XHR tracking, and separate browser/server adapters. Package names are provisional and unpublished. See architecture, FRD, compatibility and integration guide for exact behavior. Live provider delivery/attribution, real SigNoz collector ingestion, independent developer setup-time remain release evidence requirements. Browser SDK bundle now has a measured 30kB gzip budget; see compatibility.
