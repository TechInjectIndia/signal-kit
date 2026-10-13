import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
import { releaseTag } from './release-policy.mjs';
const version = JSON.parse(
  await readFile(join(root, 'packages/features/signals/core/package.json'), 'utf8'),
).version;
const folder = join(root, 'artifacts', version);
const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
assert.equal(manifest.sourceDirty, false, 'Publish only artifacts prepared from a clean commit');
const tag = releaseTag(version);
const checksums = (await readFile(join(folder, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
for (const line of checksums) {
  const [expected, file] = line.split('  ');
  assert.equal(
    createHash('sha256')
      .update(await readFile(join(folder, file)))
      .digest('hex'),
    expected,
  );
}
for (const pkg of manifest.packages) {
  assert.equal(pkg.version, version);
  const info = spawnSync('npm', ['view', `${pkg.name}@${version}`, 'dist.integrity', '--json'], {
    encoding: 'utf8',
  });
  if (info.status === 0) {
    const integrity =
      'sha512-' +
      createHash('sha512')
        .update(await readFile(join(folder, pkg.filename)))
        .digest('base64');
    assert.equal(
      JSON.parse(info.stdout),
      integrity,
      'Existing version differs from reviewed artifact',
    );
    console.log(`Already published: ${pkg.name}@${version}`);
    continue;
  }
  assert.match(info.stderr, /E404/, 'Registry/auth/network failure is not a missing package');
  const result = spawnSync(
    'npm',
    [
      'publish',
      join(folder, pkg.filename),
      '--access',
      'public',
      '--tag',
      tag,
      ...(process.env.GITHUB_ACTIONS ? ['--provenance'] : []),
    ],
    { stdio: 'inherit' },
  );
  assert.equal(
    result.status,
    0,
    `Publishing failed for ${pkg.name}; retry the same reviewed artifacts`,
  );
}
console.log(
  `Published ${version} under ${tag}. Browser CDN: https://cdn.jsdelivr.net/npm/@techinject/browser@${version}/dist/cdn/signalkit.mjs`,
);
