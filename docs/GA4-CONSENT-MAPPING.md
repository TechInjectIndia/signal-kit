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

See the [FRD](frd/signals.md), [integration guide](../packages/features/signals/INTEGRATION.md), [GA4 setup step](growth/articles/ads-utm-search-attribution.md) and [changeset](../.changeset/shiny-ties-melt.md) for the implementation contract and release note.
