# SignalKit release operations

Use `bun run changeset` for SDK changes. The nine public packages form one fixed group; apps/examples stay private. `bun run release:version` updates manifests, dependency references, changelogs and the lockfile. Changesets alpha mode is enabled. Exit prerelease mode only after an explicit stable-release decision; pre-1.0 breaking changes require migration notes.

The Releases workflow follows successful main CI and checks out that exact tested commit; manual runs use the selected workflow commit. Pending changesets open a version PR. A reviewed version PR is merged under normal branch protections. With no pending changesets and `NPM_RELEASES_ENABLED=true`, the publish job rebuilds/tests clean main, prepares checksum artifacts, publishes in dependency order, and creates a GitHub release only after all package publications succeed. The `npm-release` environment should require a human maintainer reviewer. Configure GitHub Actions to allow creating PRs; token-created PRs may need a maintainer-triggered CI run.

## Initial npm setup and publication

1. Sign in locally with `npm login`; verify membership/control of `@techinject`. Never paste credentials into chat or source.
2. Review the exact clean candidate commit, manifest, tarballs, checksums, tests and release notes. Run `bun run build`, `bun run release:prepare`, `bun run test:alpha` and the checklist in MAINTAINING.md.
3. Bootstrap the reviewed release with `bun run release:publish`. Interactive npm 2FA may be required. This publishes the nine public packages under the version's channel: alpha/beta/rc or latest for stable versions. The script verifies checksums, refuses dirty-source artifacts, and checks identical existing registry integrity when retrying a partial release.
4. In each npm package's settings, add a GitHub trusted publisher: organization `TechInjectIndia`, repository `signal-kit`, workflow `release.yml`, environment `npm-release`; allow direct npm publishing and dist-tag management for alpha channel cleanup. Use GitHub-hosted runners and the release runner uses Node 22.22.2 and npm 12.2.0. No permanent npm token is needed by this workflow.
5. Configure the GitHub `npm-release` environment with a human reviewer. Enable repository variable `NPM_RELEASES_ENABLED=true` only after all nine trusted publishers are verified. The workflow intentionally stays inactive for publishing while this bootstrap is incomplete.
6. Verify fresh registry imports and the versioned jsDelivr CDN URL before switching website examples from unpublished/source installs. Create the reviewed GitHub release with `node scripts/github-release.mjs` after publication (requires gh access).

The browser package ships `dist/cdn/signalkit.mjs` and bundled license notices. jsDelivr exposes it automatically after npm publication. Use exact versions as documented in [UPGRADING.md](UPGRADING.md); server adapters cannot run through a browser CDN.

Publication is not atomic across npm packages. If interrupted, rerun using the same reviewed artifacts; existing versions must match SHA-512 integrity. Never overwrite a release or relabel an alpha as stable. Deprecate a broken version and publish a forward fix. Record live npm/CDN verification separately from local tests.

References: [Changesets automation](https://changesets.dev/guide/automating), [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## First-publication channel cleanup

npm assigned latest as well as alpha on the initial publication. In a maintainer terminal, run `bun run release:cleanup-tags` and complete npm's authenticator prompt. Verify the alpha tag points to the current version before cleanup. The helper refuses cleanup without that matching prerelease tag and only removes latest when it points to the current or an older prerelease in the same channel and base version; an existing stable latest is preserved. Verify all nine dist-tags afterward.

The first alpha is now published, so its bootstrap changeset is archived in `.changeset/pre` rather than generating an empty repeat release. Add a new changeset for the next SDK change.

## Maintenance after a completed release

The workflow skips rebuilding a version whose GitHub release already exists. Repacking an already published version can produce a different archive; partial-release retries retain the exact registry checksum guard.

To clean stale alpha tags independently, manually run the Releases workflow with `cleanup_only=true`. This uses the same `npm-release` approval gate and scoped npm trusted publisher, performs no package publication, and retains the helper's stable/newer tag protections. Verify all nine registry tags afterward.
