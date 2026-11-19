# GA4 Consent Mode mapping and upgrade impact

## What changed

The browser GA4 adapter starts with `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization` denied before its measurement commands. It then applies the host's saved consent:

| GA4 provider configuration      | SignalKit choice  | Google Consent Mode fields granted                 |
| ------------------------------- | ----------------- | -------------------------------------------------- |
| Default                         | `analytics: true` | `analytics_storage`                                |
| Default                         | `marketing: true` | None; this adapter does not grant Google ad fields |
| `googleAdsConsent: 'marketing'` | `marketing: true` | `ad_storage`, `ad_user_data`, `ad_personalization` |

Configure the opt-in only when the host's marketing choice covers all three Google ad purposes:

```ts
createGA4Provider({ measurementId: 'G-YOURID', googleAdsConsent: 'marketing' });
```

The GA4 adapter belongs to the `analytics` category, so SignalKit does not load or call it until analytics consent is granted. A visitor who grants marketing but denies analytics therefore gets no Google consent command from this adapter, with or without the opt-in; the ad fields are first updated when analytics consent initializes the adapter.

After initialization, changes to the effective consent fields update Google. Withdrawal or disposal revokes previously granted fields. The host owns the consent banner, its wording and persistence; SignalKit does not collect consent itself.

## Repeated consent entries while debugging

An earlier adapter called `gtag('consent', 'update', ...)` from every GA4 event send. That repeated the command even when the visitor's choice had not changed. The adapter now queues one denied default on initialization, applies a saved choice before measurement when it differs from that default, and sends another update only when the effective consent state changes. Repeated page or business events on the same SDK instance do not send more consent commands. A new page load starts a new consent sequence.

The old per-event command contained only `analytics_storage`. A separate update containing only `ad_storage`, `ad_user_data` and `ad_personalization` comes from another tag or consent manager: SignalKit's default mode updates only `analytics_storage`, and its explicit ad opt-in updates all four fields together. The adapter cannot suppress commands from other integrations on the same page.

Google's [Tag Assistant consent troubleshooting guide](https://developers.google.com/tag-platform/security/guides/consent-debugging) shows the actual default and update API calls. [GA4 DebugView](https://support.google.com/analytics/answer/7201382) shows collected events. If DebugView shows an event literally named `consent`, inspect Tag Assistant and the page's `dataLayer` to identify its source: this adapter calls `gtag('consent', ...)`, not `gtag('event', 'consent', ...)`.

## Why this needs an upgrade review

Earlier browser releases did not grant the three Google ad fields even when `marketing` was true. Keeping that behavior as the default prevents an upgrade from widening an existing host's marketing choice. The new opt-in lets a host deliberately connect that choice to Google's ad fields. Another tag or consent manager may still grant them independently.

For example, a banner that described marketing consent as permission for Meta Pixel alone can keep passing `marketing: true` to SignalKit without this adapter granting Google ad storage, user data or personalization. That host should leave `googleAdsConsent` unset (or set it to `'denied'`) and check whether another tag or consent manager updates those fields. It may enable the opt-in after its consent choice covers all three Google ad purposes.

The owner confirmed on 12 November 2026 that marketing consent may authorize all three Google ad fields. The compatibility safeguard keeps that mapping opt-in. The confirmation does not establish that any individual host's existing consent choice covers those Google purposes.

## Evidence and limits

Browser jsdom tests check the denied defaults, safe behavior for existing marketing-consented hosts, explicit opt-in, saved consent before the first measurement command, analytics-only consent, marketing changes, withdrawal and disposal. They verify queued SDK commands, not live Google tag processing or provider-side delivery.

See the [FRD](frd/signals.md), [integration guide](../packages/features/signals/INTEGRATION.md) and [GA4 setup step](growth/articles/ads-utm-search-attribution.md) for the implementation contract. The release note is in the `@techinject/browser` changelog.

## Server-side Measurement Protocol and advanced consent mode — 19 November 2026

Basic consent mode is kept (decision D7). The browser GA4 adapter does not load or call Google until analytics consent is granted, so no cookieless pings are sent before consent. Advanced consent mode, which sends cookieless pings while denied, is a host and legal decision. The SDK does not implement it and does not take a position on it.

The server `ga4-mp` provider maps consent into the Measurement Protocol `consent` block. It belongs to the analytics category, so it sends only when the event's consent snapshot grants analytics and refuses otherwise.

| Provider configuration                  | Event marketing consent | `ad_user_data` and `ad_personalization` |
| --------------------------------------- | ----------------------- | --------------------------------------- |
| Default or `googleAdsConsent: 'denied'` | any                     | `DENIED`                                |
| `googleAdsConsent: 'marketing'`         | granted                 | `GRANTED`                               |
| `googleAdsConsent: 'marketing'`         | denied                  | `DENIED`                                |

Use the `'marketing'` opt-in only on hosts whose marketing choice covers both purposes, as for the browser option above. This mapping is fixture-tested with an injected transport only. Check the result in GA4 DebugView before relying on it.

## Running beside a host Google Tag Manager container — unverified

A host may load its own Google Tag Manager container (`gtm.js`) on the same page as SignalKit's GA4 adapter. Both share one `window.dataLayer`. Nothing in this section has been checked in Tag Assistant or GA4 DebugView; it describes what the adapter code does, not what Google records.

- **Shared queue and `gtag`.** The adapter reuses an existing `dataLayer` and defines `window.gtag` only when none exists (`??=`). A host-defined `gtag` is kept and receives the adapter's commands. The adapter's own stub pushes `arguments`, as Google's snippet does, so the earlier host workaround of pre-defining `window.gtag` is no longer needed.
- **Late `consent default`.** The adapter initializes on its first GA4 send, after analytics consent, and only then queues `gtag('consent', 'default', …)` with all four fields denied, followed by its own update. A host or container that already pushed its own default and update will see the adapter's default arrive later in the queue. A late default is not expected to override an earlier update, but this ordering is unverified. Check it in Tag Assistant before relying on it.
- **Ad fields.** Without `googleAdsConsent: 'marketing'` the adapter never grants `ad_storage`, `ad_user_data` or `ad_personalization`. On such a host the container or the host's consent code must grant them, if the visitor's choice covers them.
- **Duplicate GA4 tag.** Do not also configure a Google tag (or GA4 configuration tag) for the same `G-` measurement ID inside the container. Page views and events would then be sent twice, once by each producer. Use the container for other tags, or let it own GA4 and do not configure SignalKit's GA4 adapter.
- **`dispose()` on a shared queue.** Disposing the SDK (for example on unmount) pushes `analytics_storage: 'denied'` — and the three ad fields when the opt-in is on — onto the shared `dataLayer`. That applies to every Google tag on the page, including the container's. A host that keeps the container running after disposal must re-apply the visitor's consent itself.
