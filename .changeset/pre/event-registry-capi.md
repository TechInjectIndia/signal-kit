---
'@techinject/contracts': minor
'@techinject/core': minor
'@techinject/browser': minor
'@techinject/server': minor
'@techinject/nextjs': minor
'@techinject/nextjs-server': minor
'@techinject/bun': minor
'@techinject/sveltekit': minor
'@techinject/sveltekit-server': minor
---

Add `defineEvent` and `createSignals({ events })` so apps register their own typed events once and fan them out to GA4, Meta Pixel/CAPI and Clarity through the same consent, privacy, event-ID and delivery pipeline as the nine predefined events (`page_view`, `product_view`, `add_to_cart`, `begin_checkout`, `purchase`, `generate_lead`, `search`, `sign_up`, `login`). Free text that looks like an email or phone number is rejected. Product slugs containing numbers are no longer collapsed to `:id`. The standalone browser script no longer has an auto-consent attribute.

Meta CAPI now follows Meta's website-event rules: `eventSourceUrl` and a per-request `client_user_agent` are required, `client_ip_address` is accepted, and prehashed `fn`, `ln`, `ge`, `db`, `ct`, `st`, `zp` and `country` are accepted. The SDK never hashes plaintext.
