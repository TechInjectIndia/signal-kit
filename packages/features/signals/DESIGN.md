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

The SDK predefines 17 events: the original nine plus the eight lifecycle events added in B6 below. Each definition contains its schema and every provider mapping; registry mappings preserve the existing approved property conversion, while adapters retain event-ID handling.

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

The B6 events and the full mapping table are below. The nine-row table above is the original set and is superseded by B6 where they differ (`product_view` normalisation, optional correlation fields).

### Shared dispatch and privacy

Both event sources use one pipeline: resolve registered definition → validate identity/schema → strip unknown fields → apply mandatory privacy and bounded-JSON checks → apply existing capacity/disposal limits → gate each provider by its consent category → resolve/project that provider's mapping → validate mapped names/properties again → clone and send with the existing deadline, withdrawal and diagnostic handling. Definitions cannot disable these stages. The shared contracts guard rejects forbidden raw PII keys and email/phone-like free text, including nested consumer values and encoded forms; schema validation alone is insufficient. Guard limits and identifier rules are shared with predefined events. Pattern checks remain a safeguard, not proof that arbitrary host data is free of PII.

The caller's valid `eventId` and timestamp survive every copy; otherwise core generates them once. Mappings cannot replace identity or consent category. GA4 and Meta retain their existing wire event IDs; Clarity still has no event-ID parameter. Denied events are dropped without loading scripts, mapping or replay. Omitted mappings are allowed. A provider without a mapping reports `skipped` with `event_mapping_missing`, an explicit non-error outcome that is counted and shown; it never falls back to the SDK name. Invalid projections affect only that provider; other eligible providers continue. Diagnostics contain provider/status/reason, never payloads or raw errors. CAPI remains an explicit server call with separate approved matching data; purchases still require verified host state.

### Migration and approval acceptance

`phone_click`, `whatsapp_click` and `custom_event` live in each consumer example's event-definition module, outside the SDK event union, schemas and adapter switches. Contact examples use literal channels without phone numbers. The generic example retains a safe `action`, optional safe label/category and nonnegative value; all three mappings resolve their name from `action`, Meta uses custom mode, and `action` itself is not forwarded as a property. Reusable definitions are imported into the examples' browser/server roots; the standalone SDK retains only predefined events until its host explicitly registers definitions through a reviewed programmatic setup. Existing callers of the three removed built-ins must register definitions before tracking them; there is no automatic compatibility registration.

Implementation acceptance requires compile-time inference/rejection checks; registration collisions and missing mappings; nested stripping/PII and mapped-name guards; identical IDs and correct names across GA4/Meta/Clarity; consent denial/withdrawal without replay; and example consumer builds. Document migration and update PRD/FRD/integration/compatibility evidence with the approved behavior in this same PR. This change does not widen runtime or provider-support claims.

## Algorithms

Core track (B6 adds per-call options, see below): generate/preserve event ID → parse schema → strip unknown fields → capacity/dispose check → consent gate each provider → clone payload → bounded send/abort deadline → collect safe outcomes → diagnostic callback isolated. No automatic retries. setConsent coerces actual booleans and aborts category in-flight work; hooks propagate provider consent. Each event copy remains independent.

Route sanitation decodes each path segment for identity checks, then returns the original encoded segment when it is safe. An encoded slash remains inside its segment. Numeric, UUID, ObjectID, Stripe ID and CUID formats are redacted; order prefixes and general alphanumeric slugs are preserved. Hosts provide route templates or exclusions for sensitive slugs and reference IDs.

Browser: one active owner per window, deduplication on the resolved route path, owned History/fetch/XHR patches. `trackHash: true` alone enables `#/` and `#!/` hash routes; ordinary anchors remain ignored. stop only restores owned references; retained wrappers become inert. Existing valid W3C traceparent is preserved; generation only for exact origin allowlist. WeakMap per-XHR state, once loadend and send-throw cleanup. Browser observers have bounded pending work; slow/custom work cannot be forcibly cancelled without implementing disposal/consent hooks. The experimental standalone bundle exposes `window.signals`; all categories start denied and only the host banner's `setConsent` call applies the visitor's choice.

The browser observer drops records silently above 32 pending operations. This limit does not call the business-event `onDiagnostic` callback with a synthetic event or provider result.

Standalone declarative clicks require explicit item ID, price and currency; cart and checkout also require quantity. Missing or invalid attributes drop the click and emit a value-free `signalkit:diagnostic` event. Product views omit quantity when absent. Disposing the standalone instance removes its click listener.

Server: incoming trace parsed or created, AsyncLocalStorage request context, outgoing child spans with separate IDs and allowlisted headers. Wrap host handler rather than global HTTP APIs. Request bodies excluded and response objects untouched. OTLP serializes standard resourceSpans/scopeSpans, hex IDs, string nanosecond timestamps and safe HTTP attributes, observes partial rejections, deadlines and capacity.

Server outbound trace propagation uses exact `traceOrigins` entries for absolute URLs. Relative URLs require the explicit `traceRelative: true` option; its default is false. Existing host trace headers remain untouched.

Contracts keep the 17 predefined ecommerce, lead, account and search event schemas. Registered app-owned schemas validate consumer events. Every cart, checkout, list and purchase event requires at least one item; `product_view` and `refund` permit an empty or absent item array. Unknown properties are stripped recursively; the shared privacy guard rejects contact-like free text and forbidden raw identity keys. Contact examples use literal channels without phone numbers or destinations. Provider adapters map product_view to GA4 view_item, and named Meta standard events; Pixel eventID equals CAPI event_id. Core `safeProviderUrl` removes query, fragment and URL credentials before GA4 page metadata or Meta CAPI event-source dispatch. CAPI hashed matching-data allowlist, explicit Graph version and server credential; provider acceptance response checked. GA4 send_page_view:false; host disables conflicting Enhanced Measurement history tracking. Clarity requires host masking; no replay or raw custom metadata supplied by SDK.

The app-owned `custom_event` example validates `action` as a bounded lowercase identifier and its optional value as a finite nonnegative amount. It projects only safe category/label/value fields to providers. GA4, Meta Pixel custom dispatch, Meta CAPI and Clarity use that action as the event name. The SDK sends one event ID to every configured provider; GA4 and Meta carry it in their vendor calls, while Clarity's event API accepts only the name. Clarity relies on its page/session capture for `page_view` and receives explicit names for other events.

Contracts share one contact-PII detector across predefined and consumer payloads, including nested strings and property keys. It rejects email-like strings and runs of ten or more digits with common phone separators, checking raw and up to two percent-decoded forms. Mapped provider names and properties pass the same guard again before dispatch, including direct adapter calls. Rejection drops the entire event before dispatch; diagnostics contain statuses only.

Meta CAPI follows Meta's website-event rules: `event_source_url` and `client_user_agent` are required. It accepts prehashed SHA-256 `em`, `ph`, `fn`, `ln`, `ge`, `db`, `ct`, `st`, `zp`, `country` and `external_id`, plus validated unhashed `client_ip_address`, `client_user_agent` and `fbp`/`fbc`. The SDK never hashes plaintext, so raw customer data does not enter it. The host normalizes phones to E.164, hashes the digits without the leading `+`, and hashes `external_id` from a real, stable customer key with its exact case preserved. The Pixel adapter sends no advanced matching, so there is no Pixel-side value to match; the host never derives `external_id` from event IDs, URLs or random values, and omits it or skips the send when no real identifier exists. The adapter rejects plaintext in hashed fields and unknown keys. The host supplies consent and retention policy.

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

## Attribution and search sources — 4 November 2026

parseAttribution: parse URL → read allowlisted click IDs and UTMs through one safeValue clamp → compute referrer host unless same-origin → precedence: Google click IDs, Microsoft click ID, explicit utm_medium, utm_source only, fbclid, AI host, search host, social host, other host, direct. Browser store: capture at start, persist(first ?? landing, last = landing) only when allowed and landing is not direct; setConsent toggles allowed and writes or removes the single JSON key; read drops malformed or expired entries; every storage call is try/catch. GA4 config and event both call safePageLocation/safeReferrer. Search console: Google POST searchAnalytics/query with bearer token and dimension-ordered keys; Bing GET GetQueryStats or GetPageQueryStats with apikey, /Date(ms)/ parsing, date-range filtering and impressions-weighted aggregation; AbortSignal.any/timeout with manual fallback.

## Attribution self-check — 4 November 2026

`browser/src/audit.ts`: each check runs inside a try/catch collector so a hostile host object yields at most a missing finding, never a throw. Inputs default to globalThis document/location/performance. Enabled state comes from `signals.isAttributionEnabled()`; capture-dependent checks (params-removed-before-capture, consent-never-granted) run only when enabled so a disabled SDK reports one finding. Tracking-parameter detection parses URLs with `new URL(value, location.href)` against `TRACKING_PARAMETERS`. Redirect detection reads the first navigation timing entry's redirectCount and classifies `document.referrer` with core `classifyReferrerHost`. CSP parsing splits the meta content on `;`, picks script-src then default-src, and treats a source as allowing a host when it is `*`, equals the host, is a subdomain of it, or is a `*.` wildcard above it; only ga4 and meta-pixel connection names map to vendor hosts. Storage is probed with a set/remove of one audit key. Instance contention lives in `owner.ts` (`claimOwner`/`releaseOwner`/`ownerState`), which replaced the inline activeOwner guard and counts refused starts. The default bundle grows by the audit module only; no provider or server code is imported.

## B6: commerce lifecycle, per-call context and identity — 19 November 2026

Status: released in 0.1.0-alpha.6. Scope follows the owner decisions recorded in the PRD amendment of the same date. Evidence is fixture, jsdom, injected-transport and local Playwright only; no live GA4 or Meta check has been run.

### Predefined events and mappings

Seventeen predefined events. The mapping is one explicit table in contracts (`PREDEFINED_MAPPINGS`): GA4 and Clarity cover every event; Meta covers only events with a Meta standard (or the established custom `Login`) equivalent. A family without an entry makes `resolveProviderEvent` throw `event_mapping_missing`, which core reports as `skipped`.

| SDK event                                     | Schema addition                                                                                                      | GA4                 | Meta Pixel / CAPI                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------- |
| `page_view`                                   | unchanged                                                                                                            | `page_view`         | `PageView` (standard)                                      |
| `product_view`                                | commerce shape or deprecated single-item shape, normalised to `items[]`                                              | `view_item`         | `ViewContent` (standard)                                   |
| `add_to_cart`                                 | unchanged                                                                                                            | `add_to_cart`       | `AddToCart` (standard)                                     |
| `remove_from_cart`                            | commerce shape                                                                                                       | `remove_from_cart`  | none, `skipped`                                            |
| `view_cart`                                   | commerce shape                                                                                                       | `view_cart`         | none, `skipped`                                            |
| `begin_checkout`                              | commerce plus optional `checkout_id`, `customer_type`                                                                | `begin_checkout`    | `InitiateCheckout` (standard)                              |
| `add_shipping_info`                           | commerce plus `checkout_id`, `customer_type`, `shipping_tier`                                                        | `add_shipping_info` | none, `skipped`                                            |
| `add_payment_info`                            | commerce plus `checkout_id`, `customer_type`, `payment_attempt_id` (`payment_type`)                                  | `add_payment_info`  | `AddPaymentInfo` (standard)                                |
| `purchase`                                    | commerce, `transaction_id`, optional `checkout_id`, `payment_attempt_id`, `customer_type`                            | `purchase`          | `Purchase` (standard)                                      |
| `refund`                                      | `transaction_id`; optional `currency`, `value` (needs currency), `items`, `shipping`, `tax`, `coupon`, `affiliation` | `refund`            | none, `skipped`                                            |
| `view_item_list`                              | `items` (at least one), optional `item_list_id`, `item_list_name`                                                    | `view_item_list`    | none, `skipped`                                            |
| `select_item`                                 | as `view_item_list`                                                                                                  | `select_item`       | none, `skipped`                                            |
| `add_to_wishlist`                             | commerce shape                                                                                                       | `add_to_wishlist`   | `AddToWishlist` (standard)                                 |
| `generate_lead`, `sign_up`, `login`, `search` | unchanged                                                                                                            | same names          | `Lead`, `CompleteRegistration`, `Login` (custom), `Search` |

Clarity receives each event name. Items accept `index` (integer 0 to 10000), `item_list_id` and `item_list_name`. The eight new names and every provider name they map to join the reserved set, so consumer `defineEvent` calls and mappings that use them throw at registration. Predefined definitions are frozen.

`product_view` normalisation happens in `sanitizeEvent`, before the privacy guard and before any provider copy: the single-item shape becomes `{ currency?, value?, items }`, with `value` kept only when a currency exists. A canonical shape is also accepted so a direct adapter call that re-validates an already sanitised event passes. A Meta projection of an empty `items[]` sends no content fields.

### Identifier rule

Identifier-valued keys (`item_id`, `transaction_id`, `checkout_id`, `payment_attempt_id`, `item_list_id`, `order_id`, and `content_ids` including `contents[].id`) skip the free-text bare-digit phone heuristic so long numeric SKUs and order numbers survive. They still reject email-like values, a leading `+`, whitespace or parentheses, and whole-value dotted or dashed phone formats with ten or more digits, checking up to two percent-decoded forms. Free-text fields keep the full guard. `user_id` stays a forbidden property key. This applies in `isSafeEventProperties`, so mapped provider payloads pass the same rule.

### Dispatch order

`track(input, options?)` in core: read the options once (a throwing getter counts as malformed) → generate or keep the event ID → parse, normalise and sanitise the event → capacity and disposal check → per provider: skip when `options.categories` excludes its category or `options.providers` excludes its name (`skipped`, `not_targeted`) → consent gate using the call's effective consent (`denied`) → resolve the mapping (`skipped` when absent, `invalid` when it fails validation) → attach the consent snapshot and the scoped context → send with the existing deadline.

- `TrackOptions` is `{ consent?, context?, categories?, providers? }`. `providers` is an array of at most 20 provider names, each 1 to 64 characters; when both filters are given a provider must pass both, and unknown names target nothing. Malformed options return `invalid` with `track_options`; a malformed context returns `invalid` with `event_context`. Neither appears in diagnostics.
- `sanitizeEventContext` copies only allowlisted fields: `page.location` and `page.referrer` (http or https, at most 2,048 characters), `ga4.clientId`, `ga4.sessionId`, `ga4.userId`, `meta.userData` (at most 20 keys, bounded strings and arrays) and `meta.eventSourceUrl`. Strict Meta hashing, IP and user-agent validation stays in the CAPI adapter.
- Core hands each provider `page` plus only the slice for that provider's `eventFamily`. A provider with no family gets no context.
- A per-call `consent` replaces instance consent for that call. Its sends are tracked as not owned by the instance, so `setConsent` does not abort them; `dispose` still does. This option is server only: the browser wrapper never forwards it.
- With `debug: true`, core remembers up to 50 recent name-plus-properties keys in memory and calls `onWarning({ code: 'duplicate_event', name })` for a repeat within 1,000 ms. Calls that supply their own `eventId` are skipped. It never suppresses delivery and never reports values.
- `DispatchStatus` gains `skipped`. `ConnectionStatus` gains a `skipped` counter, and the dashboard renders it.

### Identity

`setUser(identity)` runs `sanitizeUserIdentity` (id `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`, optional `customerType` of `guest` or `registered`) and fans the copy out to each provider's optional `setUser`, only when that provider's category is granted, otherwise with `undefined`. `setConsent` re-runs the fan-out, so withdrawal clears and a later grant restores. `resetUser` and `dispose` clear it. An invalid identity clears any previous one. Identity is never added to an event.

### Browser algorithms

- **Page context.** The browser derives `context.page` for every tracked event: the route (hash route with `trackHash`, an explicit `page(path)`, otherwise the pathname) joined to the current origin and search, passed through `safePageLocation`, plus the sanitised referrer. The last page view's context is reused while the URL is unchanged, so later events keep an explicit route. The browser `track` and `page` forward only `categories` and `providers`.
- **Consent-time page view.** `setConsent` compares previous and next consent. For each of analytics and marketing that flipped to granted, has a provider with an `eventFamily` in that category, and has not already had a page view for the current route, one `page_view` is dispatched with `categories` set to exactly those categories. A host `page_view` sent with `providers` records the route only for granted categories where at least one named provider with an `eventFamily` belongs to that category, so excluding GA4 by name does not suppress the later analytics consent-time view. It runs only while started and not disposed. With `landingParams`, the landing URL's allowlisted query is appended once to the analytics hit when the current URL has none.
- **Preload.** With `preloadProviders`, `start()` and each grant call `prepare()` on providers of granted categories. `prepare()` sets up the vendor command queue and loads the script; it sends no event.
- **Provider identifiers.** `getProviderIds` asks only providers that implement `identifiers()`, belong to the `ga4` or `meta` family and are granted, under one shared deadline (default 500 ms, clamped 50 to 2,000). Each value is matched against a per-family pattern, consent is re-read after the wait, and a missing `fbc` falls back to `metaClickCookie` from a stored `fbclid` when marketing and the attribution category are granted.
- **Attribution gate.** `getAttribution()` returns `{}` while the attribution category is denied. The in-memory landing touch is kept and persisted on a later grant. `isAttributionCaptured()` reports capture regardless of consent for `auditAttribution`.

### Adapter changes

GA4: the `gtag` stub pushes `arguments`, as Google's snippet does, because gtag.js processes `Arguments` objects and the previous rest-parameter array may have left commands unprocessed (fixture evidence only). `page_location` and `page_referrer` come from the event's context page and are re-sanitised. `setUser` sends `gtag('set', { user_id })` and `gtag('set', 'user_properties', { customer_type })`, and includes both on the first `config`. `prepare()` and `identifiers()` (`gtag('get', ...)` with cookie fallback) are added.

Clarity: `identify` with the opaque id when analytics is granted; `prepare()` initialises the queue and grants analytics storage.

Meta Pixel: `prepare()` and `identifiers()` (`_fbp`, `_fbc`) only. There is no `setUser`, advanced matching or second `fbq('init')` in this release (decision O5).

Meta CAPI: per-call `context.meta.userData` and `context.meta.eventSourceUrl` replace, and are never merged with, the option fallbacks; `eventSourceUrl` option is now optional; a send whose event consent denies marketing throws before any network call.

### GA4 Measurement Protocol provider

`createGA4MeasurementProtocolProvider` in `@techinject/server` (`ga4-mp.ts`): name `ga4-mp`, family `ga4`, category `analytics`. It reads every value from the event copy (nothing shared across concurrent sends), maps the event to its GA4 name and properties, and posts `{ client_id, user_id?, timestamp_micros?, consent, events: [{ name, params }] }`. Rules:

- `client_id` from `context.ga4.clientId`, else the `clientId` fallback function; never generated. A missing or invalid one fails the send.
- `session_id` with `engagement_time_msec: 1` only when a session is supplied. `user_id` only when supplied and valid.
- `timestamp_micros` only for an event no more than 72 hours old and not in the future.
- `consent.ad_user_data` and `consent.ad_personalization` are `DENIED` unless `googleAdsConsent: 'marketing'` and the event's marketing consent is granted.
- The `api_secret` and `measurement_id` are URL query parameters on a URL built once at construction; transport errors are replaced by fixed messages so the secret cannot leak. `debug: true` rewrites `/mp/collect` to `/debug/mp/collect`, reads `validationMessages` and fails on any message.
- The provider refuses an event whose consent snapshot denies analytics.

Decision D5: with Measurement Protocol enabled, the browser purchase is dispatched with `providers` naming every browser provider except `ga4` (for example `['meta-pixel', 'clarity']`) and GA4 `purchase` is server only. The earlier `categories: ['marketing']` form also withheld the purchase from Clarity, which shares the `analytics` category. The host withholds the browser GA4 copy only when the server copy will actually be sent (Measurement Protocol secret configured, `client_id` stored with the order, analytics consent recorded); otherwise the browser sends it. GA4 deduplicates purchases by `transaction_id`; `event_id` is informational. Sessions stay with the vendors; the SDK holds no session.

### Framework adapters

`@techinject/nextjs` applies a changed `config.consent` in a layout effect (an isomorphic variant that uses a passive effect on the server) so child effects see current consent; the initial consent is already in the instance config. `@techinject/sveltekit` starts the client before the host applies consent. The new browser option and identity types are re-exported from `nextjs` and `sveltekit`, and `createGA4MeasurementProtocolProvider` and the context types from `nextjs-server` and `sveltekit-server`. Import boundaries are unchanged: browser and Next client packages do not import the server package, and contracts still depend on Zod only.

### Host durability example

The Bun lab stores `paid_at` once (kept on webhook replay), a consent snapshot and the GA4 ids on the order, sends the purchase with per-call `consent` and `context`, treats `sent`, `skipped` and `denied` as terminal, retries `failed`, and flags `dropped` and `invalid` rows. GA4 Measurement Protocol is enabled only when the host supplies both a measurement ID and an API secret. This is a fixture for the trust boundary, not a production queue.

### Acceptance and evidence

Unit tests in contracts, core, browser and server cover the schemas, the identifier rule, normalisation, outcomes, option validation, identity fan-out, page context, consent-time page view, provider ids, the GA4 provider and Meta context; the Next Playwright suite covers delayed consent; the Bun runtime test covers the outbox. All of it is fixture evidence. Still required before any live claim: GA4 DebugView for the `gtag` fix, `user_id`, consent-time attribution and Measurement Protocol acceptance; Meta Test Events for deduplication, `AddPaymentInfo` and `AddToWishlist`.
