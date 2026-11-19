# @techinject/core

SignalKit core adapter/package. MIT licensed, local v1.

See https://github.com/TechInjectIndia/signal-kit/tree/main/packages/features/signals/INTEGRATION.md for wiring, consent behavior and verification limits.

Added in 0.1.0-alpha.6: `track(input, { consent?, context?, categories?, providers? })` (`providers` targets by provider name; both filters must pass when combined), `setUser`/`resetUser` (forwarded only while a provider's category is granted), the `skipped` outcome (`event_mapping_missing`, `not_targeted`), `invalid` reasons `track_options` and `event_context`, and a `debug`/`onWarning` duplicate-event warning that carries no values. Fixture evidence only.
