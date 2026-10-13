import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
const version = JSON.parse(
  await readFile(join(root, 'packages/features/signals/core/package.json'), 'utf8'),
).version;
const folder = join(root, 'artifacts', version);
const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
const tag = `v${version}`;
const view = spawnSync('gh', ['release', 'view', tag], { encoding: 'utf8' });
if (view.status === 0) process.exit(0);
const assets = (await readdir(folder))
  .filter(
    (f) =>
      f.endsWith('.tgz') ||
      [
        'manifest.json',
        'SHA256SUMS.txt',
        'signalkit-browser.mjs',
        'THIRD_PARTY_LICENSES.txt',
      ].includes(f),
  )
  .map((f) => join(folder, f));
const result = spawnSync(
  'gh',
  [
    'release',
    'create',
    tag,
    '--target',
    manifest.sourceCommit,
    '--title',
    `SignalKit ${version}`,
    '--generate-notes',
    ...(version.includes('-') ? ['--prerelease'] : []),
    ...assets,
  ],
  { stdio: 'inherit' },
);
assert.equal(result.status, 0);
