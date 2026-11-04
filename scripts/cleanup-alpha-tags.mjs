import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
import { releaseTag, shouldAdvanceLatest } from './release-policy.mjs';
import { registryField } from './registry-response.mjs';
const version = JSON.parse(
  await readFile(join(root, 'packages/features/signals/core/package.json'), 'utf8'),
).version;
const channel = releaseTag(version);
if (channel === 'latest') process.exit(0);
// npm can take minutes to serve a version it has just accepted; poll before deciding.
const attempts = Number(process.env.SIGNALKIT_REGISTRY_ATTEMPTS ?? 20);
const delayMs = Number(process.env.SIGNALKIT_REGISTRY_WAIT_MS ?? 30_000);
async function publishedTags(pkg) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const view = spawnSync(
      'npm',
      ['view', `${pkg}@${version}`, 'dist-tags', '--json', '--prefer-online'],
      { encoding: 'utf8' },
    );
    if (view.status === 0) {
      const tags = registryField(view.stdout);
      assert.ok(tags !== null && typeof tags === 'object', 'Expected a registry tag map');
      if (tags[channel] === version) return tags;
    }
    if (attempt < attempts) {
      console.log(`${pkg}@${version} not visible under ${channel} yet (${attempt}/${attempts})`);
      await sleep(delayMs);
    }
  }
  assert.fail(`Cannot verify registry tags for ${pkg}@${version}`);
}
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
  const tags = await publishedTags(pkg);
  if (!shouldAdvanceLatest(tags, version)) continue;
  // Move only an older prerelease latest of this channel; preserve stable and newer tags.
  const result = spawnSync('npm', ['dist-tag', 'add', `${pkg}@${version}`, 'latest'], {
    stdio: 'inherit',
  });
  assert.equal(result.status, 0, 'Complete npm 2FA in your own terminal, then retry');
}
