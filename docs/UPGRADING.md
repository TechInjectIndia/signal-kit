# Upgrade SignalKit in every framework

All nine packages are published as `0.1.0-alpha.6`, and the versioned CDN module is verified. During alpha APIs can change; inspect the release notes before upgrading.

All nine `@techinject` packages share one exact version. Install only the packages your app needs, keep your lockfile committed, and update all directly installed SignalKit packages together. Deployed apps retain their bundled SDK until rebuilt and redeployed.

| Framework                                          | Packages / upgrade path                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js                                            | `@techinject/nextjs`, `@techinject/browser`; optional `@techinject/nextjs-server`                                                            |
| SvelteKit                                          | `@techinject/sveltekit`, `@techinject/browser`; optional `@techinject/sveltekit-server`                                                      |
| Bun                                                | `@techinject/bun`; update directly installed core/server packages too                                                                        |
| HTML / JavaScript                                  | Portable browser package or version-pinned CDN; dedicated integration coming soon                                                            |
| Hono, Node.js, Express, Fastify, NestJS            | Dedicated integrations coming soon; any existing portable core/server usage follows npm upgrades                                             |
| Astro, Vue, Angular                                | Dedicated integrations coming soon; any existing browser usage follows npm or pinned CDN upgrades                                            |
| Django, Laravel, FastAPI, Spring Boot, CodeIgniter | Native integrations coming soon; no pip/Composer/Maven upgrade command exists. Host browser integration can use the portable browser package |

Current published release:

```sh
# Use any package manager: npm shown; pnpm add --save-exact, yarn add --exact and bun add --exact work the same way.
# Next.js
npm install --save-exact @techinject/nextjs@0.1.0-alpha.6 @techinject/browser@0.1.0-alpha.6
# SvelteKit
npm install --save-exact @techinject/sveltekit@0.1.0-alpha.6 @techinject/browser@0.1.0-alpha.6
# Bun
npm install --save-exact @techinject/bun@0.1.0-alpha.6
```

Update optional server adapters and other directly installed SDK packages to the same version. Check the release's framework/runtime compatibility, run your app's tests, check consent withdrawal, page/API instrumentation and the connections dashboard, then rebuild and deploy. Never send fake purchases to verify an upgrade. Dependabot or Renovate can open update PRs in consumer repositories; consumers must configure these separately.

## CDN browser distribution

jsDelivr serves the bundled browser module from:

```js
// Current published release; browser only. Browser-only, no server imports.
import {
  createBrowserSignals,
  mountConnectionsDashboard,
} from 'https://cdn.jsdelivr.net/npm/@techinject/browser@0.1.0-alpha.6/dist/cdn/signalkit.mjs';
```

The CDN module includes the browser SDK and dashboard without external package imports. Its accompanying `dist/cdn/LICENSES.txt` contains MIT notices for SignalKit and bundled Zod. Keep the version in the URL; do not use an unversioned/latest URL in production. Update the URL, test and redeploy to upgrade. npm publication supplies CDN distribution; there is no separate uploaded CDN service. The `0.1.0-alpha.1` URL returned HTTP 200 and matched the local bundle SHA-256 on 13 October 2026; the `0.1.0-alpha.4` URL returned HTTP 200 on 29 October 2026; the `0.1.0-alpha.5` URL returned HTTP 200 on 19 November 2026. The `0.1.0-alpha.6` URL returned HTTP 200 on 19 November 2026. Your host controls CSP and authentication.

## Source / local packages

Fetch the reviewed GitHub release commit or `vVERSION` tag when it exists, install with the lockfile and rebuild. Regenerate local tarballs with `bun run release:prepare` and replace the consumer's local dependencies. Copying a package folder once does not subscribe it to future updates.

## Rollback and version policy

Restore the previous exact package versions and lockfile (or CDN URL), rebuild and redeploy. Preserve host business state and idempotency records. Release artifacts are immutable: fixes receive a new version; broken npm versions are deprecated rather than rewritten.

Stable releases use patch for compatible fixes, minor for compatible additions and major for breaking changes. Use exact prerelease versions and the `alpha` channel. npm requires a `latest` tag, so until the first stable release it follows the newest alpha; pin exact versions rather than relying on it. See [RELEASING.md](RELEASING.md).

## 0.1.0-alpha.4 B5 event registry migration

The SDK keeps its predefined events (nine at that change, 17 after the 19 November 2026 section below). `phone_click`, `whatsapp_click` and generic `custom_event` now require consumer definitions; they are not registered automatically. Import or adapt the app-owned [Next.js definitions](../examples/nextjs/signalkit.events.ts), [Bun definitions](../examples/bun/src/events.ts) or [SvelteKit definitions](../examples/sveltekit/signalkit.events.ts), and pass their readonly tuple as `events` when creating the root SDK instance. Server instances use the same definitions with their existing per-request consent and provider configuration.

Use `RegisteredEventInput<typeof events>` for an app event union; `EventInput` now describes predefined inputs only. Next apps should bind `useSignals<typeof events>()` in their app-owned hook wrapper and pass the same tuple to `SignalKitProvider`. Consumer schemas are synchronous, recursively stripping Zod objects; arbitrary records, passthrough objects and transforms are unsupported. Consumer mappings explicitly project validated keys, and the shared privacy/identity/consent checks cannot be disabled.

A configured consented provider without a mapping reported `invalid` with `event_mapping_missing` at that change and now reports `skipped` (see below); no provider name is guessed. Meta requires an explicit standard/custom mode; Clarity accepts only a mapped name. Existing event IDs still pass through GA4 and Meta, with no new Clarity deduplication claim. See [event setup and mapping tables](../packages/features/signals/INTEGRATION.md#register-consumer-defined-events-once). This migration shipped in `0.1.0-alpha.4`; hosts upgrading from `0.1.0-alpha.3` or earlier must register these definitions before tracking them.

## 0.1.0-alpha.4 Meta CAPI website-event requirements

From `0.1.0-alpha.4`, `createMetaCapiProvider` requires the `eventSourceUrl` option and a `client_user_agent` in the `userData()` matching data, because Meta requires both for website events. In `0.1.0-alpha.6` the `eventSourceUrl` option becomes optional when each call supplies `context.meta.eventSourceUrl`, and `context.meta.userData` can replace `userData()` per call (see item 8 below). Add the shopper's user agent and, ideally, `client_ip_address` from your trusted request. You can also send prehashed `fn`, `ln`, `ge`, `db`, `ct`, `st`, `zp` and `country`. The SDK still rejects plaintext in hashed fields; hash on your server after normalizing under Meta's rules. A send without a user agent fails for that provider only.

## 0.1.0-alpha.6 analytics audit changes — 19 November 2026

These changes are published in `0.1.0-alpha.6`. All new options default to off. Review each item before upgrading.

Breaking or behavior-changing:

1. **`skipped` outcome.** A consented provider with no mapping for an event now reports `skipped` with reason `event_mapping_missing` instead of `invalid`. Calls that target other categories or provider names report `skipped` with `not_targeted`. Update outbox code that requires every outcome to be `sent` (treat `skipped` as terminal, like `denied`) and add a `skipped` case to any exhaustive switch over `DispatchStatus`. `ConnectionStatus` gains a `skipped` counter. Meta reports `skipped` for `remove_from_cart`, `view_cart`, `add_shipping_info`, `refund`, `view_item_list` and `select_item`.
2. **Eight new reserved names.** `remove_from_cart`, `view_cart`, `add_shipping_info`, `add_payment_info`, `refund`, `view_item_list`, `select_item` and `add_to_wishlist` are predefined. A consumer `defineEvent` with one of these names, or a consumer mapping that targets those GA4 names or Meta `AddPaymentInfo` or `AddToWishlist`, throws at startup. A host that registered its own `remove_from_cart` must drop the definition and track the predefined event, or rename it. Its Meta custom event of that name stops, because Meta is `skipped`.
3. **`getAttribution()` is empty while denied.** It returns `{}` while the attribution category is denied. The landing touch is still held in memory and persists if consent is granted later. Remove host-side consent guards around it. `auditAttribution` now uses `isAttributionCaptured()` when present.
4. **`product_view` provider payload.** The single-item shape is normalised to `{ currency?, value?, items: [item] }`. Custom providers that read `event.properties.item_id` or `price` must read `items[0]`. Prefer the commerce shape; the old shape is deprecated.
5. **New keys pass instead of being stripped** on the events that declare them: `checkout_id`, `payment_attempt_id`, `customer_type`, `shipping_tier`, and item `index`, `item_list_id` and `item_list_name`.
6. **GA4 `dataLayer` entries are `Arguments` objects.** The GA4 adapter's `gtag` stub now pushes `arguments`, as Google's snippet does. Code or tests that read `dataLayer` entries as arrays must adapt. A host that pre-defined `window.gtag` as a workaround can remove it; a host-defined `gtag` is kept, not replaced. Hosts that also run a GTM container share the same `dataLayer`: do not configure a Google tag for the same measurement ID in the container, expect the adapter's denied `consent default` to be queued at its first send (ordering unverified), and note that `dispose()` denies `analytics_storage` on the shared queue. See [GA4 Consent Mode mapping](GA4-CONSENT-MAPPING.md#running-beside-a-host-google-tag-manager-container--unverified). Fixture evidence only; check DebugView and Tag Assistant.
7. **GA4 `page_location` changes** for hash routes (with `trackHash`) and explicit `page(path)` calls, which now follow the tracked route. Expect a reporting discontinuity for those hosts.
8. **Meta CAPI per-call context.** `context.meta.userData` and `context.meta.eventSourceUrl` on a call replace the option callbacks, which remain as fallbacks. The `eventSourceUrl` option is now optional. Providers refuse sends whose event consent denies their category.
9. **Identifier fields accept long digit runs.** Numeric SKUs, order and checkout IDs previously rejected as phone-like now pass. Emails, `+`-prefixed values, whitespace, parentheses and dotted or dashed phone formats are still rejected.
10. **`pageOnConsent`.** If you enable it, remove your own post-consent `page()` call or the page is counted twice.
11. **Zod range.** `@techinject/contracts` now depends on `zod` `^4.6.6` instead of exactly `4.6.6`, so a host on a later Zod 4 minor no longer installs a second copy. Check your lockfile after upgrading.

Additive: `setUser`, `resetUser`, `getProviderIds`, `isAttributionCaptured`, `preloadProviders`, `landingParams`, browser `track(input, { categories, providers })` and `page(path, eventId, { categories, providers })`, server `track(input, { consent, context, categories, providers })` (`providers` targets by provider name; both filters must pass when combined), `createGA4MeasurementProtocolProvider`, the `debug`/`onWarning` duplicate warning, and the `skipped` dashboard label. See the [integration guide](../packages/features/signals/INTEGRATION.md#commerce-lifecycle-events-and-outcomes).

To adopt server GA4 purchases, follow the recipe in [Server-side GA4 purchases](../packages/features/signals/INTEGRATION.md#server-side-ga4-purchases): capture `getProviderIds()` with the order, send the purchase from the server with per-call `context`, and dispatch the browser purchase with `providers` naming every browser provider except `ga4` (for example `['meta-pixel', 'clarity']`). Do not use `categories: ['marketing']` for this: it also withholds the purchase from Clarity. Withhold the browser GA4 copy only when the server copy will actually be sent (secret configured, `client_id` stored, analytics consent recorded). Verify in GA4 DebugView first; nothing in this repository has been live-verified.
