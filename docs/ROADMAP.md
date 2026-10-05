# Roadmap

Status: Proposed sequence. No delivery dates or completed SDK features are implied.

## Foundation

- OSS license, contributor policies, documentation, CI, and maintainer workflow.
- Connect public repository and enable its operational settings.

## First vertical slice

- Review event contracts, consent behavior, and destination outcomes.
- Implement verified purchase tracking with Meta Pixel/CAPI and a host-idempotency example.
- Add contract/runtime checks and explicit provider-verification steps.

## Automatic instrumentation and ecommerce

- Next.js page lifecycle, browser API telemetry, and server instrumentation.
- Bun request instrumentation with runtime-specific tests.
- GA4 mappings and product/cart/checkout events.
- Consent, duplicate instrumentation, failure, sampling, and diagnostic checks.

## Optional integrations

- Clarity and OTel/OTLP correlation based on measured use.
- Publish reproducible Next.js and Bun examples and compatibility evidence.

## Later

SvelteKit, Hono, Astro, Python/Django, and PHP/Laravel after demand and maintenance capacity are demonstrated. Native Python/PHP runtime instrumentation requires separate SDKs.
