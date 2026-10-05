# Proposed architecture

Status: Draft for review, 2026-10-05. Not an approved implementation design.

## Boundaries

SignalKit is an embeddable SDK. It requires no standalone hosted API, database, dashboard, or account. Host applications own payment state, durable idempotency, configuration, and consent collection.

Proposed package responsibilities:

| Boundary | Responsibility |
| --- | --- |
| Contracts | Versioned event envelopes, validation, safe payload types; no framework/provider dependency |
| Core | Routing, policy, bounded dispatch and diagnostics through injected ports |
| Browser | Page lifecycle, consent-controlled providers and supported fetch/XHR capture |
| Server | Server destinations and existing OTel context/export integration |
| Next.js | Framework-specific initialization, navigation and request hooks |
| Bun | Bun.serve lifecycle and request instrumentation |
| Provider adapters | GA4, Meta, Clarity, and OTLP-specific mappings/transport |

Exact package exports and public names are not reserved or published. Do not create empty package trees before the first reviewed slice.

## Data path

Host activity -> validated event -> consent/privacy policy -> selected adapter -> destination outcome.
Technical spans -> existing compatible OTel pipeline -> configured OTLP backend.

Browser/server configuration must remain separate. Identity, order ID, event ID, session ID, and trace ID are distinct. Purchase correctness cannot depend on a sampled trace or transient browser queue.

## Compatibility and reliability

Prove Next.js Node runtime and Bun behavior separately. Existing instrumentation must not be silently duplicated. No blanket edge compatibility promise. Runtime-specific instrumentation and exporters need tested alternatives where upstream OTel does not support Bun.

A caught exception is not reliable delivery. Define timeouts, retry limits, resource bounds, flush semantics, and host persistence responsibilities in feature requirements before transport implementation.

## Next design work

Finalize PRD acceptance and runtime targets, then review contracts/privacy, automatic capture, provider routing, purchase coordination, and diagnostics as separate feature requirements. Design only the first approved vertical slice. Keep common core reusable for later framework adapters.
