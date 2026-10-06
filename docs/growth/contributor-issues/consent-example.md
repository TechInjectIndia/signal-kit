## Problem

Denied initial page events are deliberately dropped. Granting consent does not replay them. New users need an explicit example of emitting the current page as a fresh event after their consent decision.

## Small contribution

Add a concise consent-grant/withdrawal recipe to the integration guide, using a local recorder. Preserve denied-by-default behavior and no replay.

## Files

- packages/features/signals/INTEGRATION.md: browser recipe.
- packages/features/signals/browser/src/browser.test.ts: focused recipe/lifecycle test if new coverage is needed.

## Acceptance

- Example starts denied, calls setConsent using real host decisions, and explicitly calls page() for a newly consented current-page event.
- Shows withdrawal blocking later analytics and advises keeping React config consent consistent.
- Explains no historical replay; never suggests cached denied events will be delivered.
- Uses no raw personal data, credentials, third-party scripts or live traffic.
- Existing consent/nav/duplicate-page tests remain green.

Read CONTRIBUTING.md and AGENTS.md. Keep the default SDK behavior unchanged. This is a documentation-focused first contribution.
