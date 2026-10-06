## Problem

OTLP export is best effort. Hosts need a clear example of surfacing capacity, timeout and transport failures through the existing onError callback without serializing provider responses or request payloads.

## Small contribution

Add an OTLP diagnostics recipe and deterministic fixture coverage. No new exporter or public API is required.

## Files

- packages/features/signals/INTEGRATION.md: concise recipe.
- packages/features/signals/server/test/server.test.ts: any missing deterministic callback coverage.

## Acceptance

- Demonstrates createOTLPObserver onError for capacity, timeout and transport reasons, with safe counters or messages.
- Uses injected fake transport to reproduce failure; no external collector/account required.
- Explains adapter completion vs collector acceptance vs downstream visibility.
- No secrets, raw response bodies or customer data in diagnostics.
- Host handler/fetch behavior remains unchanged and tests verify failure isolation.

Read CONTRIBUTING.md and AGENTS.md. Suitable for a newcomer comfortable with tests and documentation; avoid broad telemetry UI changes.
