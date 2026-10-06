# Independent alpha readiness review

Reviewed 6 October 2026 for proposed first release `0.1.0-alpha.1`. This report covers the seven SDK packages, their package exports, provider dispatch, lifecycle, tests and package/bundle verification scripts. It is a source and local fixture review, not a live provider certification.

## Verification evidence

- Node 22.21.1: `pnpm exec vitest run packages/features/signals` passed all 31 tests across seven files.
- The full workspace `pnpm test` attempt failed when the sandbox prevented the Bun example from opening an ephemeral listening socket. Bun reported `EADDRINUSE` for port 0 and Turbo canceled remaining work. This attempt does not establish a runtime regression; repeat the authorized socket checks outside the restricted sandbox.
- A direct Node fixture confirmed instrumented server POST bodies survive an active-consent request.
- A direct Node fixture confirmed an existing valid outbound trace header is preserved but the recorded request uses unrelated generated trace/span IDs.
- A jsdom fixture confirmed browser `flush()` resolves before an unresolved observer record finishes and never calls the supplied observer `flush()` hook.
- All seven manifests expose ESM runtime and declaration entry points with declared workspace dependencies. Next browser and server entry points are separate. The browser bundle script checks for server/Node imports and a 30 kB gzip ceiling. This review read those checks; it did not rerun the full packing/browser/runtime checks.

## Concrete release gates

The two reproduced SDK defects below were fixed during this review. The affected browser/server suites now pass 20 tests, including three new regression tests. Both affected package builds pass. The packaging-script gate remains assigned to the release preparation owner.

1. **Existing server outbound trace context must correlate.** `createServerSignals().fetch` creates its record IDs from local async context or fresh IDs even when preserving a valid host `traceparent`. The downstream service therefore sees a different trace from the SDK's outgoing request record. A fixture using trace ID `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` and span ID `bbbbbbbbbbbbbbbb` reproduced the mismatch. Parse valid existing wire context for the recorded outgoing span, preserve the wire header, and add a regression test. Invalid host headers should remain untouched without falsely assigning their identity to records.

2. **Browser flush must include observer work within a deadline.** `createBrowserSignals` inherits core flush, which waits only for marketing dispatch. Observer calls are counted but their promises are not awaited and their optional `flush()` hook is never invoked. A caller flushing before disposal/navigation can lose technical telemetry after an apparently completed flush. Keep a bounded set of observer operations, settle the flush snapshot within a documented timeout, invoke observer flush within that bound, and test delayed and hung observers. This must preserve failure isolation.

3. **Package verification must follow the release version.** `scripts/package-check.mjs` requires filenames ending in `0.1.0.tgz`. A legitimate `0.1.0-alpha.1` manifest bump makes the package verification fail. Read each manifest version when resolving the expected tarball. Retain the outside-workspace installation proof and ensure all seven public entry points, including `@techinject/nextjs-server`, are checked.

Fixes: server outbound records now use a valid existing wire trace identity while preserving its header and avoiding an invented local parent relationship. Browser observations now have bounded tracked promises; flush waits for the pending snapshot and calls the observer flush hook within a deadline. The browser observation deadline defaults to two seconds and uses `timeoutMs` when supplied (bounded to 1–30,000 ms). Flush has separate bounds for pending records and the observer flush hook, and it remains best effort.

Package scope ownership, npm authentication/provenance configuration, and actual publication remain separate maintainer/account decisions.

## Behavior that is limited but accurately documented

- Denied browser pages are dropped without replay when consent later changes; there is an explicit test for this behavior. The host can emit the current page after its consent decision. This is not an unnoticed queue failure.
- GA4 initialization disables its own automatic page view. Enhanced Measurement history tracking must also be disabled by the host to avoid vendor-side duplicates.
- Browser provider loaders create their own scripts and retry after load failures; integration with already loaded vendor globals requires host testing. Multiple tools are explicitly documented as requiring validation.
- Core revocation aborts active dispatch; bounded timeout/capacity, cloned provider payloads and isolated diagnostics are present. Custom providers still need to honor abort and lifecycle hooks.
- Meta Pixel maps `eventID`; CAPI maps the same logical identity to `event_id`, uses ecommerce mappings, rejects unsupported/raw matching fields and checks `events_received`. This demonstrates payload/acceptance handling only. It does not prove Meta matching, attribution or actual deduplication.
- OTLP JSON handles partial rejection and bounds hung transport; the exporter is separate from host-owned global Next OTel. SDK consent does not claim to sanitize/control every native framework span.
- Next config structure is init-only, edge is deferred, Bun route-table handlers each need wrapping, and outbound server calls need the explicit fetch adapter. These boundaries are documented.
- Schema field allowlists strip unknown metadata, while allowed commerce names and arbitrary pathname slugs still require host data discipline/templates. No evidence of a hidden server credential import into the browser package was found.

## Provider verification still required

Use owned test accounts and consented synthetic data before claiming GA4 reporting, Meta matching/deduplication, Clarity collection or SigNoz collector delivery. Browser script load/local dispatch is not receipt; mocked CAPI acceptance is not real account acceptance. This review used no live tokens, customer data, provider writes or npm publication.

After fixing the concrete gates, record the new tests, complete package/build/boundary/browser/runtime checks, then label the release alpha with these limitations. Do not describe this audit as production certification.

## Final release-owner verification

All seven tarballs now pass independent consumer imports and dispatch, including nextjs-server. Its required OpenTelemetry runtime dependencies are explicitly declared rather than supplied implicitly by the workspace. The generated local installer passes 13 checksums, imports/dispatch and overwrite refusal. Repository checks, formatting, full build/typecheck/test, boundaries, browser/SDK e2e, static-site e2e on project-path and custom-domain root, and Next local collector smoke all passed. Browser bundle: 31,803 bytes minified, 10,715 bytes gzip. Production dependency audit reported no known vulnerabilities on 6 October 2026. These are local verification results; provider accounts and registry publication remain unverified.
