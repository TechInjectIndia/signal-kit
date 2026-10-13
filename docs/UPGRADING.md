# Upgrade SignalKit in every framework

Current packages are unpublished. The registry/CDN instructions below become usable only after a numbered release is published and verified. During alpha APIs can change; inspect the release notes before upgrading.

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

Replace `VERSION` with the exact reviewed published version:

```sh
# Next.js
pnpm add --save-exact @techinject/nextjs@VERSION @techinject/browser@VERSION
# SvelteKit
pnpm add --save-exact @techinject/sveltekit@VERSION @techinject/browser@VERSION
# Bun
pnpm add --save-exact @techinject/bun@VERSION
```

Update optional server adapters and other directly installed SDK packages to the same version. Check the release's framework/runtime compatibility, run your app's tests, check consent withdrawal, page/API instrumentation and the connections dashboard, then rebuild and deploy. Never send fake purchases to verify an upgrade. Dependabot or Renovate can open update PRs in consumer repositories; consumers must configure these separately.

## CDN browser distribution

After npm publication, jsDelivr serves the bundled browser module from:

```js
// Replace VERSION with an exact published release. Browser-only, no server imports.
import {
  createBrowserSignals,
  mountConnectionsDashboard,
} from 'https://cdn.jsdelivr.net/npm/@techinject/browser@VERSION/dist/cdn/signalkit.mjs';
```

The CDN module includes the browser SDK and dashboard without external package imports. Its accompanying `dist/cdn/LICENSES.txt` contains MIT notices for SignalKit and bundled Zod. Keep the version in the URL; do not use an unversioned/latest URL in production. Update the URL, test and redeploy to upgrade. npm publication supplies CDN distribution; there is no separate uploaded CDN service. CDN availability must be verified after publication. Your host controls CSP and authentication.

## Source / local packages

Fetch the reviewed GitHub release commit or `vVERSION` tag when it exists, install with the lockfile and rebuild. Regenerate local tarballs with `pnpm release:prepare` and replace the consumer's local dependencies. Copying a package folder once does not subscribe it to future updates.

## Rollback and version policy

Restore the previous exact package versions and lockfile (or CDN URL), rebuild and redeploy. Preserve host business state and idempotency records. Release artifacts are immutable: fixes receive a new version; broken npm versions are deprecated rather than rewritten.

Stable releases use patch for compatible fixes, minor for compatible additions and major for breaking changes. Alpha releases remain explicitly prerelease-tagged and are not published under `latest`. See [RELEASING.md](RELEASING.md).
