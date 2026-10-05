# SDK v1 build report

2026-10-05. Scope: founder-authorized open-source Next.js/Bun SDK implementation. Local v1, not npm publication or production deployment.

## Delivered

One portable signals feature with seven independently buildable packages, typed Zod contracts, consent/failure-controlled dispatch, browser automatic pages/fetch/XHR, Next browser root provider and separate Node instrumentation helper, Bun handler wrapper, server tracing, GA4/Meta Pixel/CAPI/Clarity adapters and OTLP JSON observer. Local Next inspector and Bun trusted-order/HMAC/SQLite outbox fixture. OSS policies/issue forms/security reporting remain; expanded CI runs builds/types/tests/browser/collector/package checks with read-only permissions and pinned Actions.

Architecture chain: PRD → architecture → signals FRD → feature DESIGN/INTEGRATION. The explicit build instruction authorizes agreed product scope; detailed engineering defaults are documented and are not represented as separate product-owner approvals. Full orchestration chosen because multiple runtimes/providers need integration verification.

## Executors and review

| Task                                | Executor                 | Outcome                                                               |
| ----------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| Contracts/core                      | native core_sdk agent    | schema/typed DTO/consent/dispatch/trace tests and build               |
| Browser/Next                        | native browser_sdk agent | provider/browser/React/server-hook tests and build                    |
| Server/Bun                          | native server_sdk agent  | Meta/OTLP/request bounds/trace tests and real Bun smoke               |
| Browser adversarial review          | core_sdk agent           | stopped-wrapper/StrictMode/exclusion/existing-trace/XHR cleanup fixes |
| Bun webhook review                  | server_sdk agent         | malformed signed payload and persisted consent replay fixes           |
| Workspace/examples/integration/docs | root                     | complete host fixtures and combined verification                      |

Named Claude executors were unavailable; inherited native agents substituted. OpenCode CLI was present, but privacy/tracing implementation work was classified standard coding/judgment rather than mechanical. No cost/request telemetry is available: no fabricated savings or precise token/model billing claim.

## Verification

- Seven SDK leaves and two consumer hosts build; Next16.3.8 production build succeeds.
- Strict typechecks, including compiler assertions that malformed ecommerce inputs fail typing.
- 33 unit/runtime tests across nine leaf/consumer test tasks, including actual Bun1.3.4 socket and signed webhook restart/consent replay.
- Chromium Playwright: denied initial event, consent grant, one page on navigation, add-to-cart, automatic API status/timing, consent withdrawal, mobile width/screenshot. One test passed.
- Real Next Node plus local OTLP collector: six automatic spans, API inbound traceparent preserved.
- Next browser Turbo dry graph: contracts → core → browser → nextjs only, no server/Bun/OTel dependencies.
- Source/dependency boundary check passes.
- Seven packed tarballs installed in independent temporary directory using local unpublished package overrides. Public imports and dispatch pass; declarations/license present; tests/env/node_modules excluded.
- Production dependency audit reports no known vulnerabilities at check time.
- Browser bundle: 31,464 bytes minified / 10,625 bytes gzip against 30,000 byte budget; named Zod Mini imports removed full-runtime overhead. Vendor scripts/React excluded.
- First clean Linux CI passed builds/types/tests/Next collector, then exposed missing offline registry metadata in the standalone install verifier. Verifier now permits normal registry resolution with local SDK tarball overrides; clean-runner final outcome follows.

Mocked/jsdom provider calls are not GA4/Meta/Clarity acceptance, delivery, attribution or dedup verification. Bun signatures/order data are synthetic, not Razorpay test-mode/live evidence. Local OTLP recorder is not a SigNoz deployment. No independent developer setup-time study yet.

## Decisions and release limits

No hosted apps/service/DB required for SDK; SQLite belongs the host fixture only. Node/Bun inbound wrappers and explicit signals.fetch outbound calls are supported; Bun route-table handlers need individual wrappers. Next global OTel is host-owned and not gated/sanitized by SignalKit's browser/business consent; configure host policy/redaction and don't double-register providers. Custom observers cannot be forcibly cancelled without implementing disposal/consent ports. SDK delivery best effort; host owns durable outbox and retry. Stable event IDs support provider dedup without exactly-once guarantee.

Modern browser APIs required. Edge/native Django/Laravel and other host frameworks remain future. External scripts can independently observe DOM/cookies/URLs; host masking/privacy/CSP and GA4 Enhanced Measurement history settings matter. Namespace/package publisher identity, human release review, live provider/real collector validation and independent setup-time measurement remain before public npm release.
