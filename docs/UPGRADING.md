# Upgrade SignalKit in every framework

All nine packages are published as `0.1.0-alpha.2`, and the versioned CDN module is verified. During alpha APIs can change; inspect the release notes before upgrading.

All nine `@techinject` packages share one exact version. Install only the packages your app needs, keep your lockfile committed, and update all directly installed SignalKit packages together. Deployed apps retain their bundled SDK until rebuilt and redeployed.

| Framework                                          | Packages / upgrade path                                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js                                            | `@techinject/nextjs`, `@techinject/browser`; optional `@techinject/nextjs-server`                                                            |
| SvelteKit                                          | `@techinject/sveltekit`, `@techinject/browser`; optional `@techinject/sveltekit-server`                                                      |
| Bun                                                | `@techinject/bun`; update directly installed core/server packages too                                                                        |
| HTML / JavaScript                                  | Portable browser package or version-pinned CDN; dedicated integration coming soon                                                            |
| Hono, Node.js, Express, Fastify, NestJS            | Dedicated integrations coming soon; any existing portable core/server usage follows npm upgrades                                             |
| Astro, Vue, Angular                                | Dedicated integrations coming soon; any existing browser usage follows npm or pinned CDN upgrades                                            |
| Django, Laravel, FastAPI, Spring Boot, CodeIgniter | Native integrations coming soon; no pip/Composer/Maven upgrade command exists. Host browser integration can use the portable browser package |

Current published release:

```sh
# Next.js
pnpm add --save-exact @techinject/nextjs@0.1.0-alpha.2 @techinject/browser@0.1.0-alpha.2
# SvelteKit
pnpm add --save-exact @techinject/sveltekit@0.1.0-alpha.2 @techinject/browser@0.1.0-alpha.2
# Bun
pnpm add --save-exact @techinject/bun@0.1.0-alpha.2
```

Update optional server adapters and other directly installed SDK packages to the same version. Check the release's framework/runtime compatibility, run your app's tests, check consent withdrawal, page/API instrumentation and the connections dashboard, then rebuild and deploy. Never send fake purchases to verify an upgrade. Dependabot or Renovate can open update PRs in consumer repositories; consumers must configure these separately.

## CDN browser distribution

jsDelivr serves the bundled browser module from:

```js
// Current published release; browser only. Browser-only, no server imports.
import {
  createBrowserSignals,
  mountConnectionsDashboard,
} from 'https://cdn.jsdelivr.net/npm/@techinject/browser@0.1.0-alpha.2/dist/cdn/signalkit.mjs';
```

The CDN module includes the browser SDK and dashboard without external package imports. Its accompanying `dist/cdn/LICENSES.txt` contains MIT notices for SignalKit and bundled Zod. Keep the version in the URL; do not use an unversioned/latest URL in production. Update the URL, test and redeploy to upgrade. npm publication supplies CDN distribution; there is no separate uploaded CDN service. The `0.1.0-alpha.1` URL returned HTTP 200 and matched the local bundle SHA-256 on 13 October 2026; the `0.1.0-alpha.2` URL returned HTTP 200 on 29 October 2026. Your host controls CSP and authentication.

## Source / local packages

Fetch the reviewed GitHub release commit or `vVERSION` tag when it exists, install with the lockfile and rebuild. Regenerate local tarballs with `pnpm release:prepare` and replace the consumer's local dependencies. Copying a package folder once does not subscribe it to future updates.

## Rollback and version policy

Restore the previous exact package versions and lockfile (or CDN URL), rebuild and redeploy. Preserve host business state and idempotency records. Release artifacts are immutable: fixes receive a new version; broken npm versions are deprecated rather than rewritten.

Stable releases use patch for compatible fixes, minor for compatible additions and major for breaking changes. Use exact prerelease versions and the `alpha` channel. npm assigned `latest` during the first publication; removing that initial tag requires maintainer 2FA, and `latest` is reserved for stable releases. See [RELEASING.md](RELEASING.md).

## Unreleased B5 event registry migration

The working SDK keeps nine predefined events. `phone_click`, `whatsapp_click` and generic `custom_event` now require consumer definitions; they are not registered automatically. Import or adapt the app-owned [Next.js definitions](../examples/nextjs/signalkit.events.ts), [Bun definitions](../examples/bun/src/events.ts) or [SvelteKit definitions](../examples/sveltekit/signalkit.events.ts), and pass their readonly tuple as `events` when creating the root SDK instance. Server instances use the same definitions with their existing per-request consent and provider configuration.

Use `RegisteredEventInput<typeof events>` for an app event union; `EventInput` now describes predefined inputs only. Next apps should bind `useSignals<typeof events>()` in their app-owned hook wrapper and pass the same tuple to `SignalKitProvider`. Consumer schemas are synchronous, recursively stripping Zod objects; arbitrary records, passthrough objects and transforms are unsupported. Consumer mappings explicitly project validated keys, and the shared privacy/identity/consent checks cannot be disabled.

A configured consented provider without a mapping reports `invalid` with `event_mapping_missing`; no provider name is guessed. Meta requires an explicit standard/custom mode; Clarity accepts only a mapped name. Existing event IDs still pass through GA4 and Meta, with no new Clarity deduplication claim. See [event setup and mapping tables](../packages/features/signals/INTEGRATION.md#register-consumer-defined-events-once). This migration applies to the unreleased working tree; it does not change an already published package or CDN asset.
