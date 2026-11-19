---
'@techinject/contracts': minor
'@techinject/core': minor
'@techinject/browser': minor
'@techinject/server': minor
'@techinject/nextjs': minor
'@techinject/nextjs-server': minor
'@techinject/sveltekit': minor
'@techinject/sveltekit-server': minor
---

Commerce lifecycle events, per-call targeting and context, identity, and a server GA4 Measurement Protocol provider. All new options default to off. Everything is fixture-tested only; GA4 DebugView and Meta Test Events checks are still owed. See `docs/UPGRADING.md` ("Unreleased analytics audit changes") for migration steps.

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
