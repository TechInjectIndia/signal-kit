# @techinject/nextjs

SignalKit nextjs adapter/package. MIT licensed, local v1.

See https://github.com/TechInjectIndia/signal-kit/tree/main/packages/features/signals/INTEGRATION.md for wiring, consent behavior and verification limits.

Added in 0.1.0-alpha.6: the provider applies a changed `config.consent` in a layout effect so child effects see current consent. The browser options `pageOnConsent` and `preloadProviders`, `getProviderIds`, `setUser`/`resetUser` and the related types are available through `useSignals()` and the re-exports. See [integration](../INTEGRATION.md#commerce-lifecycle-events-and-outcomes).
