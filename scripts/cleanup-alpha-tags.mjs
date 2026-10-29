import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
import { releaseTag, shouldCleanupLatest } from './release-policy.mjs';
import { registryField } from './registry-response.mjs';
const version = JSON.parse(
  await readFile(join(root, 'packages/features/signals/core/package.json'), 'utf8'),
).version;
const channel = releaseTag(version);
if (channel === 'latest') process.exit(0);
const names = [
  'contracts',
  'core',
  'browser',
  'server',
  'nextjs',
  'nextjs-server',
  'bun',
  'sveltekit',
  'sveltekit-server',
];
for (const name of names) {
  const pkg = `@techinject/${name}`;
  const view = spawnSync('npm', ['view', `${pkg}@${version}`, 'dist-tags', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(view.status, 0, 'Cannot verify registry tags');
  const tags = registryField(view.stdout);
  assert.ok(tags !== null && typeof tags === 'object', 'Expected a registry tag map');
  if (!shouldCleanupLatest(tags, version)) continue;
  // Remove only this channel's current or older prerelease; preserve stable and newer tags.
  const result = spawnSync('npm', ['dist-tag', 'rm', pkg, 'latest'], { stdio: 'inherit' });
  assert.equal(result.status, 0, 'Complete npm 2FA in your own terminal, then retry');
}
