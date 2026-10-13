import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
import { releaseTag } from './release-policy.mjs';
const version = JSON.parse(
  await readFile(join(root, 'packages/features/signals/core/package.json'), 'utf8'),
).version;
if (releaseTag(version) === 'latest') process.exit(0);
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
  const view = spawnSync('npm', ['view', pkg, 'dist-tags', '--json'], { encoding: 'utf8' });
  assert.equal(view.status, 0, 'Cannot verify registry tags');
  if (JSON.parse(view.stdout).latest !== version) continue;
  // Never remove a previous stable latest tag, only this release's accidental alpha tag.
  const result = spawnSync('npm', ['dist-tag', 'rm', pkg, 'latest'], { stdio: 'inherit' });
  assert.equal(result.status, 0, 'Complete npm 2FA in your own terminal, then retry');
}
