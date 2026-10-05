# SignalKit contributor guidance

Read README.md, docs/PRD.md, CONTRIBUTING.md, and SECURITY.md before editing.

- Current task baseline is OSS repository setup. Do not claim planned SDK features are implemented.
- Next.js and Bun are the initial integration targets; preserve platform-independent contracts.
- docs/ARCHITECTURE.md is proposed, not a finalized runtime/package design. Finalize relevant behavior/design before implementing SDK slices.
- Do not scaffold dashboard, hosted API, database, or worker applications without an actual product requirement. This repository is an embeddable SDK, not a hosted application.
- Keep marketing analytics, operational telemetry, and durable business records distinct.
- Respect consent and provider-specific rules. Never expose server credentials or raw PII in browser output or diagnostics.
- Purchase tracking depends on verified host business state and host-owned idempotency.
- Distinguish mocked tests, live provider acceptance, delivery, attribution, and deduplication.
- Use injected configuration; avoid machine-specific paths and secrets.
- No real customer payloads or credentials in fixtures, issues, examples, or logs.
- Update docs and compatibility evidence with behavior changes.
- Run pnpm check and pnpm format:check. These currently validate repository hygiene only.
- Do not publish npm packages, create release tags, or widen provider support without an explicitly authorized release and completed release checklist.
