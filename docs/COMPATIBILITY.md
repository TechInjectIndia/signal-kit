# Compatibility and verification

No SDK runtime is supported yet. The development tooling currently uses Node.js 22 and pnpm 10.24.0.

| Target | Product status | Release evidence needed |
| --- | --- | --- |
| Next.js browser | Planned | Initial load, navigation, consent, fetch/XHR and duplicate-init checks |
| Next.js Node server | Planned | Request/error capture, trace context and server-secret isolation |
| Next.js edge | Deferred | Separate runtime and exporter verification |
| Bun server | Planned | Bun.serve, outbound requests, errors, lifecycle and OTel compatibility |
| Plain browser/Node core | Design goal | Framework-free examples and contract tests |
| SvelteKit/Hono/Astro | Future | Framework-specific examples and compatibility matrix |
| Django/Laravel | Future | Native Python/PHP SDKs and runtime tests |

Record exact tested versions, operating systems, deployment mode, browser versions, and limitations for every release. Local tool availability does not certify SDK compatibility.

## Evidence levels

- Contract tests: validate mappings and policy with controlled inputs.
- Runtime tests: exercise actual framework/runtime fixtures.
- Sandbox tests: verify provider sandbox behavior where offered.
- Live-provider checks: record redacted observations with dates and consented test accounts.

Provider request acceptance does not establish reporting, attribution, or deduplication. Use each provider's documented verification workflow. Never store real credentials or customer payloads as evidence.
