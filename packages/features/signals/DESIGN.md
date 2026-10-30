# Signals low-level design

Engineering implementation baseline under founder build authorization, 2026-10-05.
Sources: [FRD](../../../docs/frd/signals.md), [HLD](../../../docs/ARCHITECTURE.md).

Independent contracts contain Zod validation and discriminated event DTOs. Core owns provider/observer ports, consent and pending dispatch. Adapters own runtime patches and HTTP transport. Leaf public exports are the only supported API; no feature-internal app imports.

## Algorithms

Core track: generate/preserve event ID → parse schema → strip unknown fields → capacity/dispose check → consent gate each provider → clone payload → bounded send/abort deadline → collect safe outcomes → diagnostic callback isolated. No automatic retries. setConsent coerces actual booleans and aborts category in-flight work; hooks propagate provider consent. Each event copy remains independent.

Route sanitation decodes each path segment for identity checks, then returns the original encoded segment when it is safe. An encoded slash remains inside its segment. Numeric, UUID, ObjectID, Stripe ID and CUID formats are redacted; order prefixes and general alphanumeric slugs are preserved. Hosts provide route templates or exclusions for sensitive slugs and reference IDs.

Browser: one active owner per window, deduplication on the resolved route path, owned History/fetch/XHR patches. `trackHash: true` alone enables `#/` and `#!/` hash routes; ordinary anchors remain ignored. stop only restores owned references; retained wrappers become inert. Existing valid W3C traceparent is preserved; generation only for exact origin allowlist. WeakMap per-XHR state, once loadend and send-throw cleanup. Browser observers have bounded pending work; slow/custom work cannot be forcibly cancelled without implementing disposal/consent hooks. The experimental standalone bundle exposes `window.signals`; all categories start denied and only the host banner's `setConsent` call applies the visitor's choice.

The browser observer drops records silently above 32 pending operations. This limit does not call the business-event `onDiagnostic` callback with a synthetic event or provider result.

Standalone declarative clicks require explicit item ID, price and currency; cart and checkout also require quantity. Missing or invalid attributes drop the click and emit a value-free `signalkit:diagnostic` event. Product views omit quantity when absent. Disposing the standalone instance removes its click listener.

Server: incoming trace parsed or created, AsyncLocalStorage request context, outgoing child spans with separate IDs and allowlisted headers. Wrap host handler rather than global HTTP APIs. Request bodies excluded and response objects untouched. OTLP serializes standard resourceSpans/scopeSpans, hex IDs, string nanosecond timestamps and safe HTTP attributes, observes partial rejections, deadlines and capacity.

Server outbound trace propagation uses exact `traceOrigins` entries for absolute URLs. Relative URLs require the explicit `traceRelative: true` option; its default is false. Existing host trace headers remain untouched.

Contracts validate the original ecommerce events and review-extension lead, contact, account, search and custom events. `add_to_cart`, `begin_checkout`, and `purchase` require at least one item; `product_view` alone permits an empty item array. Unknown properties are stripped; contact channel is restricted to `phone` or `whatsapp`, with no raw phone number, destination or user ID contract fields. Provider adapters map product_view to GA4 view_item, and named Meta standard events; Pixel eventID equals CAPI event_id. Core `safeProviderUrl` removes query, fragment and URL credentials before GA4 page metadata or Meta CAPI event-source dispatch. CAPI hashed matching-data allowlist, explicit Graph version and server credential; provider acceptance response checked. GA4 send_page_view:false; host disables conflicting Enhanced Measurement history tracking. Clarity requires host masking; no replay or raw custom metadata supplied by SDK.

`custom_event.action` passes the bounded lowercase identifier pattern before dispatch, and its optional value uses the shared finite nonnegative amount validator. GA4, Meta Pixel custom dispatch, Meta CAPI and Clarity use that action as the event name. The SDK sends one event ID to every configured provider; GA4 and Meta carry it in their vendor calls, while Clarity's event API accepts only the name. Clarity relies on its page/session capture for `page_view` and receives explicit names for other events.

Contracts share one contact-PII detector across review-extension free-text schemas. It rejects email-like strings and runs of ten or more digits with common phone separators, checking raw and up to two percent-decoded forms. The custom-action direct-provider guard uses the same helper. Rejection drops the entire event before dispatch; diagnostics contain statuses only.

Meta CAPI accepts only prehashed SHA-256 `em`, `ph` and `external_id`, plus validated `fbp`/`fbc` cookies. The host normalizes phones to E.164, hashes the digits without the leading `+`, and preserves the exact case-sensitive external ID preimage used by the Pixel before hashing. The adapter rejects plaintext and extra matching fields. The host supplies consent and retention policy.

Next browser provider keeps initialized config stable, applies consent changes, deferred final disposal permits React StrictMode remount. Separate Next Node package wraps @vercel/otel for host global registration, exposes bounded safe request-error hook with host enabled gate. Don't register twice alongside existing tracing. Bun wraps fallback fetch with `instrumentBunFetch`; `instrumentBunRoutes` walks a declarative routes table and wraps function handlers and method-map handlers with their route pattern, leaving other entries intact.

## Host durability example

Bun SQLite stores trusted synthetic order and an outbox with unique order_id/event_id. Signature verified over bounded raw payload before parsing; capture status/order currency/amount matched. Paid-state update and outbox insert share transaction. Concurrent drain serialized. Sent after adapter acceptance; crash between send and marking sent can repeat delivery with stable ID. Persisted consent rechecked at drain time. Actual retries/durable consent/model storage belong production host; no SDK data migration or database dependency.

## Proof and portability

Runtime/unit/compile-time tests live with each leaf. Consumer examples build independently. Boundary script checks declared dependencies and source imports; Turbo graph ensures Next browser adapter excludes server. Real Bun/socket restart and Playwright Next navigation tests are separate from vendor sandbox/live evidence. Package tarballs include dist and MIT/community metadata; packages published under `@techinject` as npm alphas. Copy this family plus workspace tooling and declared dependencies; consumers supply runtime wiring/config.

## SvelteKit adapter extension

Owner-authorized addition, 12 October 2026: separate SSR-safe browser lifecycle and Node server-hook packages, plus a SvelteKit 3/Svelte 5 consumer lab. Browser mount/dispose retains consent/page/request semantics. Server handle/handleFetch uses route templates, isolated per-request config and framework fetch transport. Preserve responses, errors and browser/server import boundaries; no new hosted application or provider support. Node only; Kit 2/Edge remain unverified. Acceptance: leaf tests, independent package exports, browser boundary, real production SSR/navigation/consent/API trace checks.

## Host connections dashboard — 12 October 2026

Owner requested a simple dashboard inside each consuming app. Reuse the existing SDK instance: core exposes copied connection snapshots and isolated subscriptions; an optional browser/dashboard subpath renders them without polling or provider probes. Show event-provider configuration, current consent, bounded aggregate counters, latest SDK outcome and time. Never retain payloads, event IDs, raw errors, endpoints or credentials. Configuration is not connectivity; completed sends do not prove delivery or attribution. Counts are per instance, in memory; technical Observer status and cross-request/server aggregation are outside this first version. The host owns authentication and any server-to-browser snapshot endpoint. Next lab includes a noindex /connections consumer page. Verify failure/timeout/denial, duplicate names, mutation isolation, cleanup, safe rendering and real mobile navigation.

## Observability backend design — 13 October 2026

Reuse createOTLPObserver({ endpoint, serviceName, headers, ...bounds }) without changing its exact-endpoint contract. The host supplies the complete /v1/traces URL, retaining any gateway prefix such as /otlp. SigNoz Cloud uses signoz-ingestion-key; Grafana Cloud uses its supplied Authorization header; local collectors use their configured authentication or no headers. No credentials are read from process.env by the library. There are no provider-specific cloud factories.

The Sentry bridge constructs only approved synthetic exception/request fields and uses captureEvent plus bounded flush from a host-owned client. Native SDK enrichment is outside this sanitation boundary. Correlation IDs are tags rather than replacement Sentry trace context. Composite observers isolate exceptions, rejected promises, per-record mutation and stalled operations.

## Local connections observability catalog — 13 October 2026

Owner requested visibility of the new integrations on the local /connections page. The portable dashboard accepts optional host-declared observability metadata and renders Sentry, Grafana and SigNoz separately from event-provider outcomes. Next.js and SvelteKit labs list these as not configured because their observers are synthetic. Backend labels and setup guidance are fixed, while configuration/policy flags are supplied by the host. No credentials, endpoints, provider objects, health probes or invented delivery counters are exposed. Existing two-argument dashboard calls remain supported. Configuration is unverified host information, not evidence of a connection.
