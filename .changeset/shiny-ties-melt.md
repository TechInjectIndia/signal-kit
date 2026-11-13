---
'@techinject/browser': patch
---

Change GA4 Consent Mode behavior: queue denied defaults before measurement, apply saved analytics consent before the first event, and stop repeating consent updates for every GA4 event. By default the adapter updates only `analytics_storage` and does not grant Google ad fields for marketing consent. Hosts whose marketing choice covers Google ad storage, user data and personalization can explicitly opt in with `googleAdsConsent: 'marketing'`; only then does marketing consent grant those three fields.
