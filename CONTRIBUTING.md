# Contributing

SignalKit has a local SDK implementation and Next/Bun fixtures; npm publication and live-provider certification remain pending. Start with a focused issue describing a real tracking or instrumentation problem; discuss substantial API or scope changes before implementing them.

## Local workflow

Use Node.js 22 and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm typecheck
pnpm test
pnpm test:boundaries
pnpm format:check
pnpm format
```

These commands cover repository hygiene, builds, types and local/unit runtime behavior. Use pnpm test:e2e and pnpm test:next-otel for Next browser and local collector verification. They do not establish live provider delivery, attribution or universal production compatibility.

## Pull requests

- Keep changes focused and explain the problem, behavior, and limitations.
- Update relevant documentation and add meaningful verification for implemented behavior.
- Describe what was actually checked. Separate mocked checks, provider acceptance, provider-side verification, and production results.
- Include redacted diagnostics only. Never commit credentials, customer data, payment details, or real session identifiers.
- For integration changes, describe runtime versions, consent behavior, failure handling, and duplicate-event handling.
- Preserve platform-independent contracts; framework dependencies belong in integrations.

Maintainers review contributions before merging. Contributions are accepted under the repository's MIT license; no CLA or DCO is currently required. See [governance](GOVERNANCE.md), [conduct](CODE_OF_CONDUCT.md), and [security reporting](SECURITY.md).
