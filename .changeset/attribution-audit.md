---
'@techinject/core': patch
'@techinject/browser': patch
'@techinject/nextjs': patch
'@techinject/sveltekit': patch
---

`auditAttribution` runtime self-check for attribution integration mistakes (redirects or routers dropping parameters, tainted canonical, meta CSP blocking vendors, storage, consent, competing instances); `isAttributionEnabled`/`getAttributionCategory` on the browser API; `classifyReferrerHost` in core.
