# @techinject/nextjs

SignalKit nextjs adapter/package. MIT licensed, local v1.

See https://github.com/TechInjectIndia/signal-kit/tree/main/packages/features/signals/INTEGRATION.md for wiring, consent behavior and verification limits.

Added in 0.1.0-alpha.6: the provider applies a changed `config.consent` in a layout effect, so child `useEffect` callbacks in that commit see the current consent. React runs a child's `useLayoutEffect` before the provider's, so a child that tracks from `useLayoutEffect` in the same commit as a consent change still sees the previous consent; track from `useEffect` instead. The browser options `pageOnConsent` and `preloadProviders`, `getProviderIds`, `setUser`/`resetUser` and the related types are available through `useSignals()` and the re-exports. See [integration](../INTEGRATION.md#commerce-lifecycle-events-and-outcomes).
