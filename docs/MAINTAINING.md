# Maintainer operations

## GitHub setup after connecting the repository

- Assign actual maintainer accounts and update GOVERNANCE.md; avoid placeholder CODEOWNERS entries.
- Enable private vulnerability reporting before inviting public security reports.
- Enable Issues; enable Discussions only if someone can moderate them.
- Protect main: pull requests, at least one independent approval, CI / Repository checks required, resolved conversations, and no force pushes/deletion. Add CI to required checks only after its first successful run.
- If only one maintainer exists, disclose that independent review is unavailable; do not create an impossible rule or imply it exists.
- Enable Dependabot alerts and dependency security updates. Review the committed weekly update configuration.
- Use least-privilege Actions permissions; do not execute fork code with privileged pull_request_target workflows.
- Prefer squash merges and automatically delete merged branches. Preserve security-fix confidentiality.
- Add accurate repository topics and description; do not claim production readiness.
- Verify issue forms, PR template, security-report route, and CI in the public repository.

These are operational steps. Local files do not enable GitHub settings.

## Weekly maintenance

Triage reproducible defects, privacy/security reports and runtime regressions first. Label scope and duplicates, review dependency updates, and record provider deprecations. Do not auto-close valid bugs just because they are old. Assign a release owner and a backup when contributors join.

## Release policy

Use semantic versions; pre-1.0 APIs are experimental and breaking changes need migration notes. Release packages independently only after package boundaries are decided. No npm publisher or automated publish workflow is configured yet.

Before every release:

1. Define the package set, owner, version, compatibility matrix and release notes.
2. Run package typecheck/lint/build, behavior tests, actual Next.js/Bun fixtures, and repository checks. Add these commands with implementation; they do not exist today.
3. Inspect package tarballs for exports, types, sourcemaps, LICENSE, README, unwanted files, and secrets.
4. Verify consent, PII minimization, idempotency integration, failure bounds, performance, and duplicate instrumentation.
5. Record provider verification separately from mocked/contract test results.
6. Check dependency licenses and notices before distributing bundled third-party code.
7. Confirm npm name ownership and publisher identity; configure least-privilege trusted publishing/provenance where supported and account 2FA.
8. Get a human release review. Never publish from an untrusted PR or add permanent npm tokens to source.
9. Tag the reviewed commit, publish only authorized artifacts, and write changelog/migration guidance.
10. For a bad release, deprecate affected npm versions and publish a forward fix; do not silently rewrite release tags. Document advisories privately until coordinated disclosure.

## Sustainability

Track internal hours saved against maintenance/support hours. Accept a new provider only with documented demand, a maintainer, safe mappings, contract/runtime evidence and a provider verification plan. No SLA, sponsorship account or paid support is implied by this repository.
