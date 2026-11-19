# @techinject/browser

## 0.1.0-alpha.6

### Minor Changes

- b05c304: Commerce lifecycle events, per-call targeting and context, identity, and a server GA4 Measurement Protocol provider. All new options default to off. Everything is fixture-tested only; GA4 DebugView and Meta Test Events checks are still owed. See `docs/UPGRADING.md` ("Unreleased analytics audit changes") for migration steps.
  - `@techinject/contracts`: eight new predefined events (`remove_from_cart`, `view_cart`, `add_shipping_info`, `add_payment_info`, `refund`, `view_item_list`, `select_item`, `add_to_wishlist`); `skipped` dispatch status with `event_mapping_missing` and `not_targeted` reasons; `TrackOptions` (`consent`, `context`, `categories`, `providers`) and `EventContext` types; identifier fields accept long digit runs; `zod` dependency widened from `4.6.6` to `^4.6.6`.
  - `@techinject/core`: per-call `track(input, { consent, context, categories, providers })` with validation (`track_options`, `event_context`); `setUser`/`resetUser` fan-out gated by category consent; `debug`/`onWarning` duplicate-event warning that carries no values.
  - `@techinject/browser`: GA4 `gtag` stub pushes `arguments` and keeps a host-defined `gtag`; GA4 `page_location` follows the tracked route; `getProviderIds`, `isAttributionCaptured`, `pageOnConsent` (with `landingParams`), `preloadProviders`, browser `track`/`page` accept `categories` and `providers`; Clarity `identify`; dashboard `skipped` label.
  - `@techinject/server`: `createGA4MeasurementProtocolProvider` (`ga4-mp`); Meta CAPI reads per-call `context.meta`, `eventSourceUrl` option becomes optional, and providers refuse sends whose consent snapshot denies their category.
  - `@techinject/nextjs` and `@techinject/sveltekit`: new browser options and types re-exported; Next applies consent changes in a layout effect; SvelteKit starts before applying consent.
  - `@techinject/nextjs-server` and `@techinject/sveltekit-server`: re-export `createGA4MeasurementProtocolProvider` and the per-call option types.

  **Breaking:**
  - A consented provider with no mapping for an event reports `skipped` (`event_mapping_missing`) instead of `invalid`. Outbox code must treat `skipped` as terminal; exhaustive switches need a `skipped` case.
  - Eight event names become reserved. A consumer `defineEvent` with one of them, or a mapping to their GA4 names or Meta `AddPaymentInfo`/`AddToWishlist`, throws at startup.
  - `getAttribution()` returns `{}` while the attribution category is denied.
  - `product_view` reaches providers as `{ currency?, value?, items: [item] }`; custom providers must read `items[0]` instead of top-level `item_id`/`price`.
  - GA4 `dataLayer` entries are `Arguments` objects, not arrays.
  - GA4 `page_location` changes for hash routes and explicit `page(path)` calls.
  - Meta CAPI per-call `context.meta.userData`/`eventSourceUrl` replace the option fallbacks for that call.

### Patch Changes

- Updated dependencies [b05c304]
  - @techinject/contracts@0.1.0-alpha.6
  - @techinject/core@0.1.0-alpha.6

## 0.1.0-alpha.5

### Patch Changes

- 2707ad3: Change GA4 Consent Mode behavior: queue denied defaults before measurement, apply saved analytics consent before the first event, and stop repeating consent updates for every GA4 event. By default the adapter updates only `analytics_storage` and does not grant Google ad fields for marketing consent. Hosts whose marketing choice covers Google ad storage, user data and personalization can explicitly opt in with `googleAdsConsent: 'marketing'`; only then does marketing consent grant those three fields.
- @techinject/contracts@0.1.0-alpha.5
  - @techinject/core@0.1.0-alpha.5

## 0.1.0-alpha.4

### Minor Changes

- bf1b7f3: Add `defineEvent` and `createSignals({ events })` so apps register their own typed events once and fan them out to GA4, Meta Pixel/CAPI and Clarity through the same consent, privacy, event-ID and delivery pipeline as the nine predefined events (`page_view`, `product_view`, `add_to_cart`, `begin_checkout`, `purchase`, `generate_lead`, `search`, `sign_up`, `login`). Free text that looks like an email or phone number is rejected. Product slugs containing numbers are no longer collapsed to `:id`. The standalone browser script no longer has an auto-consent attribute.

  Meta CAPI now follows Meta's website-event rules: `eventSourceUrl` and a per-request `client_user_agent` are required, `client_ip_address` is accepted, and prehashed `fn`, `ln`, `ge`, `db`, `ct`, `st`, `zp` and `country` are accepted. The SDK never hashes plaintext.

### Patch Changes

- e2ec072: `auditAttribution` runtime self-check for attribution integration mistakes (redirects or routers dropping parameters, tainted canonical, meta CSP blocking vendors, storage, consent, competing instances); `isAttributionEnabled`/`getAttributionCategory` on the browser API; `classifyReferrerHost` in core.
- 0c59252: GA4 keeps allowlisted campaign/click parameters and the referrer host; opt-in first-party visit-source capture; Search Console and Bing Webmaster clients at `@techinject/server/search-console`.
- Updated dependencies [bf1b7f3]
- Updated dependencies [e2ec072]
- Updated dependencies [0c59252]
  - @techinject/contracts@0.1.0-alpha.4
  - @techinject/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Minor Changes

- 899d4e2: Add a consent-aware Sentry error bridge and isolated observer composition. Document shared OTLP endpoint/authentication configuration for local and cloud SigNoz/Grafana backends and serverless flush ownership.

  Expose optional safe observability configuration cards in the portable connections dashboard, with Sentry, Grafana and SigNoz entries in both local labs.

### Patch Changes

- @techinject/contracts@0.1.0-alpha.3
  - @techinject/core@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- 508626d: Correct browser package documentation after the first npm publication.
- @techinject/contracts@0.1.0-alpha.2
  - @techinject/core@0.1.0-alpha.2
