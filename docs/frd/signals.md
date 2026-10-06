# Signal delivery and instrumentation FRD

Implementation baseline for the founder's 2026-10-05 build instruction. Detailed defaults are engineering choices; no independent approval of this file is claimed.
Sources: [PRD](../PRD.md), [architecture](../ARCHITECTURE.md).

## Event flow

Hosts emit named ecommerce events with typed payloads. Schemas validate currency, finite nonnegative value, bounded item lists, positive quantity, and purchase transaction ID. Unknown fields are stripped at runtime. Each provider receives its own cloned safe payload. Caller event ID survives browser/server copies and retry; otherwise generate UUID. Transaction, event and trace IDs are independent.

Consent categories analytics, marketing and observability default false. Drop denied events; never queue for later replay. Withdrawal aborts supported pending transports, invokes provider consent hooks, and prevents future dispatch. Data already accepted by a provider cannot be retracted. Host must supply and persist real consent; SDK is not a consent-management platform.

GA4 consumes page and business analytics, Meta consumes marketing conversions with shared eventID/event_id, optional Clarity consumes analytics. Explicit verified purchase only. No automatic API call becomes a business conversion. Dispatch returns per-provider sent/denied/failed/invalid/dropped outcomes without raw provider errors or response bodies. Sent means adapter completion: provider-side attribution/dedup must be tested separately.

## Automatic technical flow

Browser once per page: initial page, pathname changes via History API/popstate, fetch/XHR method normalized route status duration failures. Query/hash-only changes produce no automatic page event. Repeated mounting must not duplicate initial pages. Instrumentation doesn't consume response/request bodies, mutate host results, or add trace headers outside configured origins. Existing valid context is preserved. Own patches are restored on stop; other libraries' patches are preserved.

Bun once around its fetch handler: incoming request plus explicit signals.fetch outbound requests, concurrent context isolation, route resolver. Bun route-table handlers bypass fallback fetch and must be wrapped individually. No native/global fetch mutation on server. Next uses a browser root provider and host-owned Node OTel registration to capture framework incoming requests; wrap outbound calls with signals.fetch where needed. Existing host OTel providers stay host-owned. Edge not supported.

Default redaction removes query/hash, numeric/UUID/email/long token path segments. Arbitrary sensitive slugs cannot be inferred; host route templates/exclusions remain necessary. Known browser provider telemetry domains excluded; custom collector endpoints require excludeUrls.

## Failure and resource policy

Default core 100 pending events and 5s dispatch deadlines. Custom observer pending work bounded; OTLP default20 requests/2s deadline. On overload drop and expose adapter diagnostics. No unlimited retry, durability or guaranteed delivery in SDK. Host outbox owns persisted order/payment consent and retry. Business host operations continue on tracking failures.

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
