# SignalKit contributor guidance

Read README.md, docs/PRD.md, CONTRIBUTING.md, and SECURITY.md before editing.

- SDK implementation lives in packages/features/signals with local Next/Bun examples. Read compatibility and build report before making verification claims.
- Next.js and Bun are the initial integration targets; preserve platform-independent contracts.
- docs/ARCHITECTURE.md records the authorized build baseline. Engineering defaults are documented decisions, not separately approved requirements.
- Do not scaffold dashboard, hosted API, database, or worker applications without an actual product requirement. This repository is an embeddable SDK, not a hosted application.
- Keep marketing analytics, operational telemetry, and durable business records distinct.
- Respect consent and provider-specific rules. Never expose server credentials or raw PII in browser output or diagnostics.
- Purchase tracking depends on verified host business state and host-owned idempotency.
- Distinguish mocked tests, live provider acceptance, delivery, attribution, and deduplication.
- Use injected configuration; avoid machine-specific paths and secrets.
- No real customer payloads or credentials in fixtures, issues, examples, or logs.
- Update docs and compatibility evidence with behavior changes.
- Run pnpm check/format:check/build/typecheck/test/test:boundaries and affected runtime checks. Local socket tests require permission to listen.
- Do not publish npm packages, create release tags, or widen provider support without an explicitly authorized release and completed release checklist.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.

<!-- END:turborepo-agent-rules -->

## Architecture contract

Read PRD, architecture, docs/frd/signals.md and packages/features/signals/DESIGN.md before changes. New material scope follows PRD → HLD → FRD → LLD with the owner. SDK-only project: no empty hosted apps. Host consumer examples are independently built. Browser and Next client packages must not import server packages or credentials; Next server integration belongs separate package. Contracts depend Zod only; core depends contracts only; inject runtime/config/transport. Keep the portable family self-contained with declared public imports. Update INTEGRATION.md, compatibility and tests with behavior changes. Demo UI follows docs/DESIGN_SYSTEM.md, semantic/noindex metadata and responsive keyboard interaction. Production payment/state/database/consent are host-owned. Host global OTel is distinct from SDK category consent; do not claim its native spans sanitized by SDK. Do not publish without explicit release authorization.
