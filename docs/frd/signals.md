# Signal delivery and instrumentation FRD

Implementation baseline for the founder's 2026-10-05 build instruction. Detailed defaults are engineering choices; no independent approval of this file is claimed.
Sources: [PRD](../PRD.md), [architecture](../ARCHITECTURE.md).

## Event flow

Hosts emit typed ecommerce events (`product_view`, `add_to_cart`, `begin_checkout`, `purchase`) and review-extension events (`generate_lead`, `phone_click`, `whatsapp_click`, `sign_up`, `login`, `search`, `custom_event`). Schemas validate currency, finite nonnegative value, bounded item lists, positive quantity, and purchase transaction ID. `add_to_cart`, `begin_checkout`, and `purchase` require at least one item; only `product_view` may use an empty item list. Contact events allow only a non-identifying `channel` (`phone` or `whatsapp`), never phone numbers or destinations. Raw user IDs are not event properties. Unknown fields are stripped at runtime. Each provider receives its own cloned safe payload. Caller event ID survives browser/server copies and retry; otherwise generate UUID. Transaction, event and trace IDs are independent.

Consent categories analytics, marketing and observability default false. Drop denied events; never queue for later replay. Withdrawal aborts supported pending transports, invokes provider consent hooks, and prevents future dispatch. Data already accepted by a provider cannot be retracted. Host must supply and persist real consent; SDK is not a consent-management platform.

GA4 consumes page and business analytics, Meta consumes marketing conversions with shared eventID/event_id, optional Clarity consumes analytics. Explicit verified purchase only. No automatic API call becomes a business conversion. Dispatch returns per-provider sent/denied/failed/invalid/dropped outcomes without raw provider errors or response bodies. Sent means adapter completion: provider-side attribution/dedup must be tested separately.

`custom_event` requires an `action` matching `^[a-z][a-z0-9_]{0,39}$`. That action becomes the GA4 event name, the Meta Pixel custom event name, the Meta CAPI event name, and the Clarity event name. Each configured provider receives the same SDK event ID; GA4 and Meta can include it in their calls, while Clarity's event API takes only a name. Clarity page views use its page/session capture without an explicit event call. The integration mapping table records every event's behavior for each provider.

The contracts reject the entire event when `search_term`, `custom_event` `action`/`label`/`category`, `lead_type`, or auth `method` contains email- or phone-like text, including common percent-encoded forms. No rejected value appears in provider payloads or diagnostics. This pattern check is a bounded safeguard; hosts remain responsible for avoiding personal data in all event fields.

## Automatic technical flow

Browser once per page: initial page, pathname changes via History API/popstate, fetch/XHR method normalized route status duration failures. Query-only changes produce no automatic page event. Hash-only changes produce no page event unless `trackHash: true` enables `#/` or `#!/` route tracking; ordinary anchors remain ignored. Deduplicate on the resolved route path. Repeated mounting must not duplicate initial pages. Instrumentation doesn't consume response/request bodies, mutate host results, or add trace headers outside configured origins. Existing valid context is preserved. Own patches are restored on stop; other libraries' patches are preserved. The experimental standalone bundle exposes `window.signals`; all categories start denied, no script attribute grants consent, and the host consent banner calls `window.signals.setConsent(...)`.

Standalone declarative product/cart/checkout clicks require explicit item ID, price and currency; cart/checkout also require quantity. Missing or invalid attributes drop the click and emit a diagnostic containing only status, reason and attribute name. No placeholder item, price, currency or quantity is inserted.

Bun once around its fetch handler: incoming request plus explicit signals.fetch outbound requests, concurrent context isolation, route resolver. Bun route-table handlers bypass fallback fetch; passing the declarative routes table through `instrumentBunRoutes` wraps its handlers with their route patterns. No native/global fetch mutation on server. Next uses a browser root provider and host-owned Node OTel registration to capture framework incoming requests; wrap outbound calls with signals.fetch where needed. Existing host OTel providers stay host-owned. Edge not supported.

Server outbound fetch adds trace context to absolute URLs only for exact `traceOrigins` matches. Relative URLs require `traceRelative: true` and a host transport that supports relative fetch; the default is false. Existing trace headers are never replaced.

Default redaction removes query/hash, numeric/UUID/email/long token path segments and recognized ObjectID, Stripe ID and CUID formats. The shared core URL sanitizer removes query strings, fragments and URL credentials from GA4 page metadata and Meta CAPI event-source URLs; attribution parameters are not forwarded. Product slugs containing numbers remain distinct paths. Arbitrary sensitive slugs and order/reference IDs cannot be inferred safely; hosts must supply route templates or exclusions for those paths. Known browser provider telemetry domains excluded; custom collector endpoints require excludeUrls.

## Failure and resource policy

Default core 100 pending events and 5s dispatch deadlines. Custom observer pending work bounded; OTLP default20 requests/2s deadline. Core event overload produces a dispatch diagnostic. Browser observer records beyond the 32-pending bound are dropped silently; they do not create fake event/provider outcomes. No unlimited retry, durability or guaranteed delivery in SDK. Host outbox owns persisted order/payment consent and retry. Business host operations continue on tracking failures.

Third-party scripts load only for allowed provider dispatch and use vendor revocation APIs. Scripts' own DOM/cookie/network behavior is outside SDK payload sanitation; configure masking, automatic-event settings and CSP. Script failure produces failed/dropped outcome. Browser global JS errors and unhandled rejection capture are outside this request-only v1 contract; Next supplemental request-error hook is available.

## Acceptance mapping

| Rule                                   | Evidence                                                 |
| -------------------------------------- | -------------------------------------------------------- |
| Schema/privacy/typed purchase          | contracts runtime tests and compiler negative assertions |
| Consent/capacity/deadline/isolation    | core tests                                               |
| Navigation/fetch/XHR/trace/exclusions  | browser tests + Next Playwright                          |
| Incoming/outbound correlation          | server tests + Bun real socket smoke                     |
| CAPI event mapping/rejection           | injected transport tests; no live evidence               |
| OTLP JSON/rejection/withdrawal         | transport tests; no real SigNoz evidence                 |
| HMAC/order verification/durable replay | Bun synthetic signed webhook process restart test        |

## SvelteKit adapter extension

Owner-authorized addition, 12 October 2026: separate SSR-safe browser lifecycle and Node server-hook packages, plus a SvelteKit 3/Svelte 5 consumer lab. Browser mount/dispose retains consent/page/request semantics. Server handle/handleFetch uses route templates, isolated per-request config and framework fetch transport. Preserve responses, errors and browser/server import boundaries; no new hosted application or provider support. Node only; Kit 2/Edge remain unverified. Acceptance: leaf tests, independent package exports, browser boundary, real production SSR/navigation/consent/API trace checks.

## Host connections dashboard — 12 October 2026

Owner requested a simple dashboard inside each consuming app. Reuse the existing SDK instance: core exposes copied connection snapshots and isolated subscriptions; an optional browser/dashboard subpath renders them without polling or provider probes. Show event-provider configuration, current consent, bounded aggregate counters, latest SDK outcome and time. Never retain payloads, event IDs, raw errors, endpoints or credentials. Configuration is not connectivity; completed sends do not prove delivery or attribution. Counts are per instance, in memory; technical Observer status and cross-request/server aggregation are outside this first version. The host owns authentication and any server-to-browser snapshot endpoint. Next lab includes a noindex /connections consumer page. Verify failure/timeout/denial, duplicate names, mutation isolation, cleanup, safe rendering and real mobile navigation.

## Observability backend behavior — 13 October 2026

The existing OTLP exporter sends request spans to the exact configured URL with supplied headers for both local and cloud backends. No separate SigNoz Cloud or Grafana Cloud factory is exposed. Sentry reports status 0/5xx request failures and explicit sanitized exception classifications through a supplied client. Successful requests and ordinary 4xx responses do not become Sentry issues.

Composed observers receive independent record copies and propagate consent, flush and disposal with bounded waits and isolated failures. Test endpoint/header forwarding for local and cloud destinations, consent denial/withdrawal, disposal, rejected/hanging transports and redaction. Account connectivity, metrics/log export and deployed serverless behavior require separate evidence.

## Local connections observability catalog — 13 October 2026

Owner requested visibility of the new integrations on the local /connections page. The portable dashboard accepts optional host-declared observability metadata and renders Sentry, Grafana and SigNoz separately from event-provider outcomes. Next.js and SvelteKit labs list these as not configured because their observers are synthetic. Backend labels and setup guidance are fixed, while configuration/policy flags are supplied by the host. No credentials, endpoints, provider objects, health probes or invented delivery counters are exposed. Existing two-argument dashboard calls remain supported. Configuration is unverified host information, not evidence of a connection.
