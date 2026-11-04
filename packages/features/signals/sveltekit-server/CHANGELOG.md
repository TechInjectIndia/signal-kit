# @techinject/sveltekit-server

## 0.1.0-alpha.4

### Minor Changes

- bf1b7f3: Add `defineEvent` and `createSignals({ events })` so apps register their own typed events once and fan them out to GA4, Meta Pixel/CAPI and Clarity through the same consent, privacy, event-ID and delivery pipeline as the nine predefined events (`page_view`, `product_view`, `add_to_cart`, `begin_checkout`, `purchase`, `generate_lead`, `search`, `sign_up`, `login`). Free text that looks like an email or phone number is rejected. Product slugs containing numbers are no longer collapsed to `:id`. The standalone browser script no longer has an auto-consent attribute.

  Meta CAPI now follows Meta's website-event rules: `eventSourceUrl` and a per-request `client_user_agent` are required, `client_ip_address` is accepted, and prehashed `fn`, `ln`, `ge`, `db`, `ct`, `st`, `zp` and `country` are accepted. The SDK never hashes plaintext.

### Patch Changes

- 0c59252: GA4 keeps allowlisted campaign/click parameters and the referrer host; opt-in first-party visit-source capture; Search Console and Bing Webmaster clients at `@techinject/server/search-console`.
- Updated dependencies [bf1b7f3]
- Updated dependencies [0c59252]
  - @techinject/server@0.1.0-alpha.4

## 0.1.0-alpha.3

### Minor Changes

- 899d4e2: Add a consent-aware Sentry error bridge and isolated observer composition. Document shared OTLP endpoint/authentication configuration for local and cloud SigNoz/Grafana backends and serverless flush ownership.

  Expose optional safe observability configuration cards in the portable connections dashboard, with Sentry, Grafana and SigNoz entries in both local labs.

### Patch Changes

- Updated dependencies [899d4e2]
  - @techinject/server@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- @techinject/server@0.1.0-alpha.2
