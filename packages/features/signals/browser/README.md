# @techinject/browser

SignalKit browser adapter/package. MIT licensed, alpha candidate; unpublished.

Optional in-app connection status UI: import `mountConnectionsDashboard` from
`@techinject/browser/dashboard`, then call it with an existing DOM element and SDK
instance. The returned function unsubscribes and removes the view. No provider probes,
payloads, credentials, storage or polling. See the repository's
[dashboard guide](https://github.com/TechInjectIndia/signal-kit/blob/main/docs/CONNECTIONS-DASHBOARD.md).

See https://github.com/TechInjectIndia/signal-kit/tree/main/packages/features/signals/INTEGRATION.md for wiring, consent behavior and verification limits.
