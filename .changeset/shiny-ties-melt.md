---
'@techinject/browser': patch
---

Change GA4 Consent Mode behavior: default analytics_storage, ad_storage, ad_user_data, and ad_personalization to denied before measurement; grant analytics_storage for analytics consent and all three ad fields for marketing consent, including ad_personalization. Hosts should grant marketing only when their consent choice covers all three ad fields.
