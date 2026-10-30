# Signals low-level design

Engineering implementation baseline under founder build authorization, 2026-10-05.
Sources: [FRD](../../../docs/frd/signals.md), [HLD](../../../docs/ARCHITECTURE.md).

Independent contracts contain Zod validation and discriminated event DTOs. Core owns provider/observer ports, consent and pending dispatch. Adapters own runtime patches and HTTP transport. Leaf public exports are the only supported API; no feature-internal app imports.

## B5: predefined and consumer-defined events

Status: LLD approved for implementation in this session on 30 October 2026. Contracts/core use an instance-local event registry; predefined and consumer events share the same validation and delivery pipeline.

### Registry and public API

`@techinject/contracts` owns event-definition types, schemas, privacy validation and predefined definitions. `@techinject/core` re-exports `defineEvent` and accepts `createSignals({ events: [...] })`. Browser/server and framework adapters pass the same definitions through their existing root config. Definitions are declared once in an app-owned module and registered when the root SDK instance is created; there is no global registry or runtime registration API. Server instances receive the same immutable definitions with request-specific consent and provider configuration.

`defineEvent({ name, schema, map: { ga4?, meta?, clarity? } })` preserves the literal name and infers properties from a synchronous Zod object schema. Consumer object schemas, including nested objects, must strip unknown keys; passthrough schemas, arbitrary records and transforms that can introduce unchecked fields are rejected. The registry snapshots definitions at initialization and rejects duplicate names, predefined-name overrides and unsafe names. `track` accepts the union of predefined inputs and registered consumer inputs; unregistered names are rejected at runtime, including from JavaScript callers. Framework hooks preserve the app's registry type through an app-owned typed wrapper rather than widening properties to arbitrary records.

Host shape (import the other definitions from the app-owned event module):

```ts
import * as z from 'zod/mini';
import { createSignals, defineEvent } from '@techinject/core';

const phoneClick = defineEvent({
  name: 'phone_click',
  schema: z.object({ channel: z.literal('phone') }),
  map: {
    ga4: { name: 'phone_click', properties: { channel: 'channel' } },
    meta: { name: 'Contact', mode: 'standard', properties: { channel: 'channel' } },
    clarity: { name: 'phone_click' },
  },
});

const events = [phoneClick, whatsappClick, customEvent] as const;
const signals = createSignals({ events, providers, consent });
await signals.track({ name: 'phone_click', properties: { channel: 'phone' } });
```

Each mapping declares a provider event name and an explicit projection from validated schema keys to provider property keys. Meta also declares `mode: 'standard' | 'custom'`; the same definition serves Pixel and CAPI, with the predefined registry mapping preserving ecommerce property conversion. Clarity receives only the name. Dynamic names use `{ from: 'action' }` instead of an arbitrary mapping callback; the source must be a validated string field. Names must pass `^[a-z][a-z0-9_]{0,39}$` for SDK/GA4/Clarity/custom Meta events; Meta standard names use a maintained standard-name allowlist. Consumer custom mappings cannot impersonate predefined provider events such as `purchase`/`Purchase`. Provider adapters declare their mapping family explicitly; custom provider names are not used to infer it. Custom providers without a mapping family receive the sanitized canonical event.

### Predefined schemas and mappings

These nine events remain in the SDK. Each definition contains its schema and every provider mapping; registry mappings preserve the existing approved property conversion, while adapters retain event-ID handling.

| SDK event        | Schema requirement                                      | GA4              | Meta Pixel / CAPI                 | Clarity                |
| ---------------- | ------------------------------------------------------- | ---------------- | --------------------------------- | ---------------------- |
| `page_view`      | Bounded nonempty `page_path`                            | `page_view`      | `PageView` (standard)             | Page/session capture   |
| `product_view`   | Existing item or commerce shape; empty items allowed    | `view_item`      | `ViewContent` (standard)          | `product_view` event   |
| `add_to_cart`    | Currency, nonnegative value, at least one valid item    | `add_to_cart`    | `AddToCart` (standard)            | `add_to_cart` event    |
| `begin_checkout` | Currency, nonnegative value, at least one valid item    | `begin_checkout` | `InitiateCheckout` (standard)     | `begin_checkout` event |
| `purchase`       | Commerce shape plus nonempty transaction ID             | `purchase`       | `Purchase` (standard)             | `purchase` event       |
| `generate_lead`  | Optional nonnegative value, currency and safe lead type | `generate_lead`  | `Lead` (standard)                 | `generate_lead` event  |
| `search`         | Bounded nonempty safe `search_term`                     | `search`         | `Search` (standard)               | `search` event         |
| `sign_up`        | Optional safe `method`                                  | `sign_up`        | `CompleteRegistration` (standard) | `sign_up` event        |
| `login`          | Optional safe `method`                                  | `login`          | `Login` (custom)                  | `login` event          |

### Shared dispatch and privacy

Both event sources use one pipeline: resolve registered definition → validate identity/schema → strip unknown fields → apply mandatory privacy and bounded-JSON checks → apply existing capacity/disposal limits → gate each provider by its consent category → resolve/project that provider's mapping → validate mapped names/properties again → clone and send with the existing deadline, withdrawal and diagnostic handling. Definitions cannot disable these stages. The shared contracts guard rejects forbidden raw PII keys and email/phone-like free text, including nested consumer values and encoded forms; schema validation alone is insufficient. Guard limits and identifier rules are shared with predefined events. Pattern checks remain a safeguard, not proof that arbitrary host data is free of PII.

The caller's valid `eventId` and timestamp survive every copy; otherwise core generates them once. Mappings cannot replace identity or consent category. GA4 and Meta retain their existing wire event IDs; Clarity still has no event-ID parameter. Denied events are dropped without loading scripts, mapping or replay. Omitted mappings are allowed, but an enabled configured provider reports `invalid` with `event_mapping_missing`; it never silently skips the event or falls back to the SDK name. Invalid projections affect only that provider; other eligible providers continue. Diagnostics contain provider/status/reason, never payloads or raw errors. CAPI remains an explicit server call with separate approved matching data; purchases still require verified host state.

### Migration and approval acceptance

`phone_click`, `whatsapp_click` and `custom_event` live in each consumer example's event-definition module, outside the SDK event union, schemas and adapter switches. Contact examples use literal channels without phone numbers. The generic example retains a safe `action`, optional safe label/category and nonnegative value; all three mappings resolve their name from `action`, Meta uses custom mode, and `action` itself is not forwarded as a property. Reusable definitions are imported into the examples' browser/server roots; the standalone SDK retains only predefined events until its host explicitly registers definitions through a reviewed programmatic setup. Existing callers of the three removed built-ins must register definitions before tracking them; there is no automatic compatibility registration.

Implementation acceptance requires compile-time inference/rejection checks; registration collisions and missing mappings; nested stripping/PII and mapped-name guards; identical IDs and correct names across GA4/Meta/Clarity; consent denial/withdrawal without replay; and example consumer builds. Document migration and update PRD/FRD/integration/compatibility evidence with the approved behavior in this same PR. This change does not widen runtime or provider-support claims.

## Algorithms

Core track: generate/preserve event ID → parse schema → strip unknown fields → capacity/dispose check → consent gate each provider → clone payload → bounded send/abort deadline → collect safe outcomes → diagnostic callback isolated. No automatic retries. setConsent coerces actual booleans and aborts category in-flight work; hooks propagate provider consent. Each event copy remains independent.

Route sanitation decodes each path segment for identity checks, then returns the original encoded segment when it is safe. An encoded slash remains inside its segment. Numeric, UUID, ObjectID, Stripe ID and CUID formats are redacted; order prefixes and general alphanumeric slugs are preserved. Hosts provide route templates or exclusions for sensitive slugs and reference IDs.

Browser: one active owner per window, deduplication on the resolved route path, owned History/fetch/XHR patches. `trackHash: true` alone enables `#/` and `#!/` hash routes; ordinary anchors remain ignored. stop only restores owned references; retained wrappers become inert. Existing valid W3C traceparent is preserved; generation only for exact origin allowlist. WeakMap per-XHR state, once loadend and send-throw cleanup. Browser observers have bounded pending work; slow/custom work cannot be forcibly cancelled without implementing disposal/consent hooks. The experimental standalone bundle exposes `window.signals`; all categories start denied and only the host banner's `setConsent` call applies the visitor's choice.

The browser observer drops records silently above 32 pending operations. This limit does not call the business-event `onDiagnostic` callback with a synthetic event or provider result.

Standalone declarative clicks require explicit item ID, price and currency; cart and checkout also require quantity. Missing or invalid attributes drop the click and emit a value-free `signalkit:diagnostic` event. Product views omit quantity when absent. Disposing the standalone instance removes its click listener.

Server: incoming trace parsed or created, AsyncLocalStorage request context, outgoing child spans with separate IDs and allowlisted headers. Wrap host handler rather than global HTTP APIs. Request bodies excluded and response objects untouched. OTLP serializes standard resourceSpans/scopeSpans, hex IDs, string nanosecond timestamps and safe HTTP attributes, observes partial rejections, deadlines and capacity.

Server outbound trace propagation uses exact `traceOrigins` entries for absolute URLs. Relative URLs require the explicit `traceRelative: true` option; its default is false. Existing host trace headers remain untouched.

Contracts keep the nine predefined ecommerce, lead, account and search event schemas. Registered app-owned schemas validate consumer events. `add_to_cart`, `begin_checkout`, and `purchase` require at least one item; `product_view` alone permits an empty item array. Unknown properties are stripped recursively; the shared privacy guard rejects contact-like free text and forbidden raw identity keys. Contact examples use literal channels without phone numbers or destinations. Provider adapters map product_view to GA4 view_item, and named Meta standard events; Pixel eventID equals CAPI event_id. Core `safeProviderUrl` removes query, fragment and URL credentials before GA4 page metadata or Meta CAPI event-source dispatch. CAPI hashed matching-data allowlist, explicit Graph version and server credential; provider acceptance response checked. GA4 send_page_view:false; host disables conflicting Enhanced Measurement history tracking. Clarity requires host masking; no replay or raw custom metadata supplied by SDK.

The app-owned `custom_event` example validates `action` as a bounded lowercase identifier and its optional value as a finite nonnegative amount. It projects only safe category/label/value fields to providers. GA4, Meta Pixel custom dispatch, Meta CAPI and Clarity use that action as the event name. The SDK sends one event ID to every configured provider; GA4 and Meta carry it in their vendor calls, while Clarity's event API accepts only the name. Clarity relies on its page/session capture for `page_view` and receives explicit names for other events.

Contracts share one contact-PII detector across predefined and consumer payloads, including nested strings and property keys. It rejects email-like strings and runs of ten or more digits with common phone separators, checking raw and up to two percent-decoded forms. Mapped provider names and properties pass the same guard again before dispatch, including direct adapter calls. Rejection drops the entire event before dispatch; diagnostics contain statuses only.

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
