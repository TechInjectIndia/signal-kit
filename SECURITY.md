# Security policy

SignalKit is a project foundation with no released SDK. There are currently no supported production releases or security-update guarantees.

## Reporting a vulnerability

Do not publish exploit details, credentials, personal data, or sensitive diagnostics in an issue or pull request.

Private vulnerability reporting was enabled and verified on 2026-10-05 for [TechInjectIndia/signal-kit](https://github.com/TechInjectIndia/signal-kit/security/advisories/new). Use **Security → Report a vulnerability**. Forks must enable their own reporting channel.

If private reporting is unavailable, ask a maintainer to establish a private reporting channel. A public request should contain only a request for confidential contact, with no vulnerability details. Wait for the private channel before sharing the report. Anonymous reporting and a dedicated security contact are not currently provided.

A useful private report includes affected files or versions, runtime, impact, redacted reproduction steps, and a proposed fix if available. Maintainers will assess reports and coordinate fixes and disclosure, but no response SLA is offered.

## Safe development

Keep provider secrets server-side. Use synthetic fixtures and redact event payloads and identifiers. Avoid exposing request bodies, credentials, or personal data through instrumentation and diagnostics. Provider acceptance is not proof of delivery, attribution, or deduplication.

See [contribution guidance](CONTRIBUTING.md) and [support](SUPPORT.md).
