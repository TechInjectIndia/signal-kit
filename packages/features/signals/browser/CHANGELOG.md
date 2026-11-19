# @techinject/browser

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
