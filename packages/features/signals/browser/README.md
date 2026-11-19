# @techinject/browser

SignalKit browser SDK. MIT licensed; experimental alpha API.

Optional in-app connection status UI: import `mountConnectionsDashboard` from
`@techinject/browser/dashboard`, then call it with an existing DOM element and SDK
instance. The returned function unsubscribes and removes the view. No provider probes,
payloads, credentials, storage or polling. See the repository's
[dashboard guide](https://github.com/TechInjectIndia/signal-kit/blob/main/docs/CONNECTIONS-DASHBOARD.md).

See https://github.com/TechInjectIndia/signal-kit/tree/main/packages/features/signals/INTEGRATION.md for wiring, consent behavior and verification limits.

## Added in 0.1.0-alpha.6 (fixture evidence only)

- `track(input, { categories, providers })` and `page(path, eventId, { categories, providers })`: deliver to providers in those consent categories and/or with those names only; the others report `skipped`. Use `providers` to exclude one vendor (for example `['meta-pixel', 'clarity']` to skip `ga4` when the server sends the GA4 purchase). The browser ignores per-call `consent` and `context`.
- `pageOnConsent: true | { landingParams: true }`: one new `page_view` for the current route when analytics or marketing is granted, sent only to the newly granted categories. Remove any manual post-consent `page()` call. Off by default.
- `preloadProviders: true`: call each granted provider's `prepare()` (script load, no data). Off by default.
- `setUser({ id, customerType })` and `resetUser()`: opaque host user key to GA4 and Clarity while analytics is granted. The Meta Pixel adapter has no advanced matching.
- `getProviderIds({ timeoutMs })`: GA4 `clientId` and `sessionId`, Meta `fbp` and `fbc`, from granted providers only.
- `getAttribution()` returns `{}` while the attribution category is denied; `isAttributionCaptured()` reports capture regardless of consent.
- Seventeen predefined events. Providers without a mapping report `skipped`. The dashboard shows a skipped count.

Nothing here has been checked against live GA4 or Meta; see [compatibility](https://github.com/TechInjectIndia/signal-kit/blob/main/docs/COMPATIBILITY.md).
