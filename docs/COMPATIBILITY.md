# Compatibility and evidence

SDK v1 local implementation, 2026-10-05. Package version0.1.0 is unpublished. Peer ranges are integration declarations, not proof of every version in range.

| Target                                      | Recorded version                               | Evidence                                                                     |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Tooling                                     | Node22.21.1, pnpm10.24.0, TS5.9.3, Turbo2.11.7 | workspace builds/typechecks                                                  |
| Bun                                         | 1.3.4 macOS arm64                              | real Bun.serve socket, inbound trace, signed synthetic payment/restart tests |
| Next App Router Node                        | 16.3.8, React19.3.0                            | production build, browser runtime and local OTel recorder                    |
| Modern Chromium                             | Playwright pinned lockfile browser             | navigation/consent/API/commerce fixture                                      |
| GA4/Meta Pixel/Clarity                      | public SDK interfaces                          | jsdom command/script fixtures; no provider sandbox/live proof                |
| Meta CAPI                                   | caller selects explicit Graph API version      | injected HTTP acceptance/rejection fixtures only                             |
| OTLP HTTP JSON                              | standard trace envelope                        | JSON transport/rejection/consent tests; no SigNoz deployment proof           |
| Next Edge                                   | unsupported                                    | not tested                                                                   |
| SvelteKit/Hono/Astro/HTML integration hosts | future                                         | generic browser/server contracts only; no compatibility claim                |
| Django/Laravel                              | future native adapters                         | no implementation                                                            |

Requirements: modern browser crypto.randomUUID, structuredClone, fetch/Headers, URL and performance. SSR import/start guards supported. Outbound server instrumentation is signals.fetch, not global Node/Bun fetch. No browser JS error/rejection auto-capture; request failures plus optional Next request-error hook only. Bun routes require individual wrappers.

Counts, commands, graph and local runtime outcomes are recorded in the build report. Setup-time usability, independent developer onboarding and live provider dedup/attribution remain release gates. No synthetic test should be described as live tracking verification.

All exported browser adapters bundled with esbuild: 31,464 bytes minified / 10,625 bytes gzip. Engineering guard: <=30,000 bytes gzip (measurement excludes downloaded vendor scripts and React).
