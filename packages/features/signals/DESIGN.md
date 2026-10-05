# Signals low-level design

Engineering implementation baseline under founder build authorization, 2026-10-05.
Sources: [FRD](../../../docs/frd/signals.md), [HLD](../../../docs/ARCHITECTURE.md).

Independent contracts contain Zod validation and discriminated event DTOs. Core owns provider/observer ports, consent and pending dispatch. Adapters own runtime patches and HTTP transport. Leaf public exports are the only supported API; no feature-internal app imports.

## Algorithms

Core track: generate/preserve event ID → parse schema → strip unknown fields → capacity/dispose check → consent gate each provider → clone payload → bounded send/abort deadline → collect safe outcomes → diagnostic callback isolated. No automatic retries. setConsent coerces actual booleans and aborts category in-flight work; hooks propagate provider consent. Each event copy remains independent.

Browser: one active owner per window, pathname dedup, owned History/fetch/XHR patches. stop only restores owned references; retained wrappers become inert. Existing valid W3C traceparent is preserved; generation only for exact origin allowlist. WeakMap per-XHR state, once loadend and send-throw cleanup. Browser observers have bounded pending work; slow/custom work cannot be forcibly cancelled without implementing disposal/consent hooks.

Server: incoming trace parsed or created, AsyncLocalStorage request context, outgoing child spans with separate IDs and allowlisted headers. Wrap host handler rather than global HTTP APIs. Request bodies excluded and response objects untouched. OTLP serializes standard resourceSpans/scopeSpans, hex IDs, string nanosecond timestamps and safe HTTP attributes, observes partial rejections, deadlines and capacity.

Provider adapters map product_view to GA4 view_item, and named Meta standard events; Pixel eventID equals CAPI event_id. CAPI hashed matching-data allowlist, explicit Graph version and server credential; provider acceptance response checked. GA4 send_page_view:false; host disables conflicting Enhanced Measurement history tracking. Clarity requires host masking; no replay or raw custom metadata supplied by SDK.

Next browser provider keeps initialized config stable, applies consent changes, deferred final disposal permits React StrictMode remount. Separate Next Node package wraps @vercel/otel for host global registration, exposes bounded safe request-error hook with host enabled gate. Don't register twice alongside existing tracing. Bun wraps fallback fetch or each route-table handler.

## Host durability example

Bun SQLite stores trusted synthetic order and an outbox with unique order_id/event_id. Signature verified over bounded raw payload before parsing; capture status/order currency/amount matched. Paid-state update and outbox insert share transaction. Concurrent drain serialized. Sent after adapter acceptance; crash between send and marking sent can repeat delivery with stable ID. Persisted consent rechecked at drain time. Actual retries/durable consent/model storage belong production host; no SDK data migration or database dependency.

## Proof and portability

Runtime/unit/compile-time tests live with each leaf. Consumer examples build independently. Boundary script checks declared dependencies and source imports; Turbo graph ensures Next browser adapter excludes server. Real Bun/socket restart and Playwright Next navigation tests are separate from vendor sandbox/live evidence. Package tarballs include dist and MIT/community metadata; package names provisional/unpublished. Copy this family plus workspace tooling and declared dependencies; consumers supply runtime wiring/config.
