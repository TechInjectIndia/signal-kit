# Contributing

SignalKit has a local SDK implementation and Next/Bun fixtures; npm publication and live-provider certification remain pending. Start with a focused issue describing a real tracking or instrumentation problem; discuss substantial API or scope changes before implementing them.

## Local workflow

Use Bun 1.4.4 or newer (`.bun-version`). Node.js 22 with npm is also needed for `bun run test:consumers` (client apps on npm, pnpm and yarn), `bun run test:sveltekit` (the SvelteKit production app runs on real Node), and the generated `artifacts/<version>/install-local.mjs` installer, which uses npm.

```sh
bun install --frozen-lockfile
bun run check
bun run build
bun run typecheck
bun run test
bun run test:boundaries
bun run format:check
bun run format
```

These commands cover repository hygiene, builds, types and local/unit runtime behavior. Use bun run test:e2e and bun run test:next-otel for Next browser and local collector verification. They do not establish live provider delivery, attribution or universal production compatibility.

## Pull requests

- Keep changes focused and explain the problem, behavior, and limitations.
- Update relevant documentation and add meaningful verification for implemented behavior.
- Describe what was actually checked. Separate mocked checks, provider acceptance, provider-side verification, and production results.
- Include redacted diagnostics only. Never commit credentials, customer data, payment details, or real session identifiers.
- For integration changes, describe runtime versions, consent behavior, failure handling, and duplicate-event handling.
- Preserve platform-independent contracts; framework dependencies belong in integrations.

Maintainers review contributions before merging. Contributions are accepted under the repository's MIT license; no CLA or DCO is currently required. See [governance](GOVERNANCE.md), [conduct](CODE_OF_CONDUCT.md), and [security reporting](SECURITY.md).
