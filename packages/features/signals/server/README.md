# @techinject/server

SignalKit server adapter/package. MIT licensed, local v1.

See https://github.com/TechInjectIndia/signal-kit/tree/main/packages/features/signals/INTEGRATION.md for wiring, consent behavior and verification limits.

## GA4 Measurement Protocol

`createGA4MeasurementProtocolProvider({ measurementId, apiSecret })` sends GA4 events from the server
(provider `ga4-mp`, family `ga4`, category `analytics`). Pass the browser's GA4 `client_id` per call
in `context.ga4.clientId`; the SDK never invents one and fails the send without it. When this
provider is enabled, GA4 `purchase` is server-only: dispatch the browser copy with
`providers: [...]` naming every browser provider except `ga4` (for example
`['meta-pixel', 'clarity']`) so the browser GA4 adapter does not also send it. Do not use
`categories: ['marketing']` for this: it also withholds the purchase from Clarity, which shares
the `analytics` category. Withhold the browser GA4 copy only when the server copy will actually be
sent (API secret configured, `client_id` stored with the order, analytics consent recorded);
otherwise send it from the browser. A 2xx from the live
endpoint means the envelope was received, not that GA4 recorded the event; use `debug: true`
(validation server, nothing recorded) in sandboxes and DebugView for acceptance. Tests in this
package are fixture evidence only.

Per-call context: `track(input, { consent, context, categories, providers })`; `providers` targets by provider name (for example `['ga4-mp']`) and must also match `categories` when both are given. `context.meta.userData` and `context.meta.eventSourceUrl` replace the Meta CAPI option fallbacks (`eventSourceUrl` is now optional); `context.ga4` carries `clientId`, `sessionId` and `userId` for Measurement Protocol. `consent` replaces instance consent for that call only. Providers refuse sends whose consent snapshot denies their category, and a provider with no mapping for an event reports `skipped`. All of this is unreleased and fixture-tested only.
