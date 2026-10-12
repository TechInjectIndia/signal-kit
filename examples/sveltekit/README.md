# SvelteKit local lab

Build the workspace, then run pnpm --filter @signalkit/example-sveltekit dev at http://127.0.0.1:3400. For the built Node app, run PORT=3400 HOST=127.0.0.1 ORIGIN=http://127.0.0.1:3400 pnpm --filter @signalkit/example-sveltekit exec node build/index.js. pnpm test:sveltekit checks the built server in Chromium.

Pinned SvelteKit 3.0.1, Svelte 5.57.2, adapter-node 6.0.0, Vite 8.3.4, plugin 7.3.1 and TypeScript 6.0.3. Kit 3 config lives in the Vite sveltekit plugin and tsconfig extends $app/tsconfig. SDK packages retain their existing tooling except the server adapter's framework-compatible type-check dependency.

Browser consent starts denied. Grant synthetic analytics/observability, navigate, add a cart event and call API. Records remain local. Server observability is enabled only as a synthetic fixture policy; real hosts supply actual request consent. /api/records is an in-memory test inspector, explicitly excluded from telemetry. It is not a production endpoint, persistence layer or dashboard. Pages are noindex. No provider account or secret required.

The production browser test verifies SSR/hydration, navigation page counts, consent withdrawal, cart/request records and internal SvelteKit fetch trace correlation. This is local runtime evidence, not provider acceptance, matching or attribution. Other SvelteKit majors and Edge deployments remain unverified.
