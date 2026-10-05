# SignalKit

Open-source telemetry for Next.js and Bun: automatic page and API instrumentation, typed ecommerce events, and configurable provider adapters.

**Status: repository foundation. SDK implementation has not started. No packages have been published and no runtime compatibility has been certified.**

## Purpose

Make tracking easier to integrate, verify, and reuse across ecommerce projects. Keep framework dependencies out of the shared core so future integrations can reuse the same event contracts.

## First release scope

| Area | Planned behavior |
| --- | --- |
| Next.js | Initial page views, client navigation, browser fetch/XHR telemetry, and server request instrumentation |
| Bun | Request instrumentation through a Bun.serve integration and server-side business events |
| Ecommerce | Typed product_view, add_to_cart, begin_checkout, and purchase events |
| Marketing | GA4 and coordinated Meta Pixel + Conversions API; optional Clarity |
| Observability | OpenTelemetry/OTLP and browser-to-server correlation; Bun compatibility must be verified |
| Privacy | Explicit consent input, allowlisted payloads, secret isolation, and configurable exclusions |
| Diagnostics | Explain validation, consent decisions, routing, and dispatch outcomes |

Automatic technical capture does not infer successful purchases. Purchase events come from verified payment/order state. Provider acceptance is not proof of delivery, attribution, or deduplication.

No hosted account is planned for the SDK. Receiving backends and marketing services retain their own accounts, terms, and costs.

## Work on the repository

Use Node.js 22 and pnpm 10.24.0. These commands validate repository hygiene and documentation, not an SDK:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm format:check
```

`pnpm format` normalizes text whitespace and final newlines. It is not a TypeScript code formatter. Package build, lint, and runtime tests will be added with implementation.

## Project documents

- [Product requirements](docs/PRD.md)
- [Proposed architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Runtime compatibility](docs/COMPATIBILITY.md)
- [Maintainer and release checklist](docs/MAINTAINING.md)
- [Changelog](CHANGELOG.md)

## Participate

Read [Contributing](CONTRIBUTING.md), [Governance](GOVERNANCE.md), and the [Code of Conduct](CODE_OF_CONDUCT.md). See [Support](SUPPORT.md) for questions and [Security](SECURITY.md) for private vulnerability reporting.

The project is stewarded by the Tech Inject project team. The public repository is [TechInjectIndia/signal-kit](https://github.com/TechInjectIndia/signal-kit). Maintainer identities will be recorded as responsibility is assigned. Sponsorship and response-time commitments are not currently offered.

## License

[MIT](LICENSE). Third-party SDKs, services, trademarks, and APIs retain their own licenses and terms.
