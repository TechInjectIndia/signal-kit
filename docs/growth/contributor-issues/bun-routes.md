## Problem

Bun's routes table bypasses its fallback fetch handler. A developer wrapping only fetch can miss routed requests, even though the SDK documentation mentions this boundary.

## Small contribution

Add a self-contained Bun routes-table example and explain where each handler is wrapped. Keep SDK behavior unchanged.

## Files

- examples/bun: add a small isolated routes fixture/test.
- packages/features/signals/INTEGRATION.md: link and explain the fixture.

## Acceptance

- One static route and one dynamic /orders/:id handler are each wrapped with instrumentBunFetch.
- Real Bun test confirms one incoming record per request, correct status and route template, preserved server argument, and no query/body capture.
- Fallback request coverage is documented separately; no live provider credentials or calls.
- A developer can run the fixture with the documented command.

Read CONTRIBUTING.md and AGENTS.md. Ask here before widening the SDK API. This is suitable for a newcomer familiar with Bun and tests.
