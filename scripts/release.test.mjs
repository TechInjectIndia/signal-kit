import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseTag, shouldCleanupLatest } from './release-policy.mjs';
import { mkdtemp, cp, mkdir, readFile, rm, symlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './files.mjs';
import { createHash } from 'node:crypto';
import { registryField } from './registry-response.mjs';
test('Changesets produces one numbered alpha and changelogs for all nine packages', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'signalkit-version-'));
  try {
    // Changesets detects the Bun workspace from package.json workspaces plus bun.lock.
    for (const file of ['package.json', 'bun.lock']) await cp(join(root, file), join(folder, file));
    await mkdir(join(folder, '.changeset'));
    await cp(join(root, '.changeset/config.json'), join(folder, '.changeset/config.json'));
    await writeFile(
      join(folder, '.changeset/pre.json'),
      JSON.stringify({ mode: 'pre', tag: 'alpha' }),
    );
    await writeFile(
      join(folder, '.changeset/isolated-test.md'),
      '---\n"@techinject/core": patch\n---\n\nIsolated versioning proof.\n',
    );
    await symlink(join(root, 'node_modules'), join(folder, 'node_modules'));
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
      const leaf = join(folder, 'packages/features/signals', name);
      await mkdir(leaf, { recursive: true });
      await cp(
        join(root, 'packages/features/signals', name, 'package.json'),
        join(leaf, 'package.json'),
      );
    }
    const result = spawnSync(
      process.execPath,
      [join(root, 'node_modules/@changesets/cli/bin.js'), 'version'],
      { cwd: folder, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const versions = [];
    for (const name of names) {
      const leaf = join(folder, 'packages/features/signals', name);
      versions.push(JSON.parse(await readFile(join(leaf, 'package.json'), 'utf8')).version);
      assert.ok(
        (await readFile(join(leaf, 'CHANGELOG.md'), 'utf8')).includes(`## ${versions.at(-1)}`),
      );
    }
    assert.equal(new Set(versions).size, 1);
    assert.equal(releaseTag(versions[0]), 'alpha');
    assert.notEqual(versions[0], '0.1.0-alpha.1');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('prereleases never publish under latest; invalid versions fail closed', () => {
  assert.equal(releaseTag('1.0.0'), 'latest');
  for (const channel of ['alpha', 'beta', 'rc'])
    assert.equal(releaseTag(`0.1.0-${channel}.2`), channel);
  for (const invalid of ['latest', '1.0.0-dev.1', '01.0.0', '1.0.0-alpha', '1.0.0-alpha.01'])
    assert.throws(() => releaseTag(invalid));
});
test('standalone CDN module imports and dispatches without external modules or DOM', async () => {
  const { createBrowserSignals, mountConnectionsDashboard } = await import(
    '../packages/features/signals/browser/dist/cdn/signalkit.mjs'
  );
  assert.equal(typeof mountConnectionsDashboard, 'function');
  let received;
  const sdk = createBrowserSignals({
    autoTrack: false,
    consent: { analytics: true, marketing: false, observability: false },
    providers: [
      {
        name: 'test',
        category: 'analytics',
        send(event) {
          received = event;
        },
      },
    ],
  });
  await sdk.page('/upgrade?private=1');
  assert.equal(received.properties.page_path, '/upgrade');
  assert.equal(sdk.getConnections()[0].sent, 1);
  sdk.dispose();
});

test('alpha tag cleanup preserves stable latest and refuses to remove the sole valid tag', () => {
  const version = '0.1.0-alpha.1';
  assert.equal(shouldCleanupLatest({ latest: version, alpha: version }, version), true);
  assert.equal(shouldCleanupLatest({ latest: '0.0.1', alpha: version }, version), false);
  assert.equal(shouldCleanupLatest({ alpha: version }, version), false);
  assert.equal(shouldCleanupLatest({ latest: '1.0.0' }, '1.0.0'), false);
  assert.throws(() => shouldCleanupLatest({ latest: version }, version));
  assert.throws(() => shouldCleanupLatest({ latest: version, alpha: '0.1.0-alpha.0' }, version));
});

test('cleanup removes an older alpha latest only when the current alpha tag is intact', () => {
  const current = '0.1.0-alpha.2';
  assert.equal(shouldCleanupLatest({ latest: '0.1.0-alpha.1', alpha: current }, current), true);
  for (const latest of ['0.1.0-alpha.3', '0.0.9-alpha.1', '0.1.0-beta.1', '0.1.0', 'unexpected'])
    assert.equal(shouldCleanupLatest({ latest, alpha: current }, current), false);
  assert.throws(() =>
    shouldCleanupLatest({ latest: '0.1.0-alpha.1', alpha: '0.1.0-alpha.1' }, current),
  );
});

async function registryFixture() {
  const folder = await mkdtemp(join(tmpdir(), 'signalkit-registry-response-'));
  await mkdir(join(folder, 'scripts'));
  await mkdir(join(folder, 'bin'));
  await mkdir(join(folder, 'packages/features/signals/core'), { recursive: true });
  await writeFile(
    join(folder, 'packages/features/signals/core/package.json'),
    JSON.stringify({ version: '0.1.0-alpha.2' }),
  );
  for (const script of [
    'files.mjs',
    'release-policy.mjs',
    'registry-response.mjs',
    'cleanup-alpha-tags.mjs',
    'publish-packages.mjs',
  ])
    await cp(join(root, 'scripts', script), join(folder, 'scripts', script));
  return folder;
}
test('npm 12 wrapped tag response removes all nine stale alpha tags through the real helper', async () => {
  const folder = await registryFixture();
  try {
    const log = join(folder, 'removed.txt');
    const mock = join(folder, 'bin/npm');
    await writeFile(
      mock,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'view') console.log(JSON.stringify([{ latest: '0.1.0-alpha.1', alpha: '0.1.0-alpha.2' }]));
else if (args[0] === 'dist-tag' && args[1] === 'rm' && args[3] === 'latest') fs.appendFileSync(${JSON.stringify(log)}, args[2]+'\\n');
else process.exit(2);
`,
    );
    await chmod(mock, 0o755);
    const result = spawnSync(process.execPath, [join(folder, 'scripts/cleanup-alpha-tags.mjs')], {
      cwd: folder,
      encoding: 'utf8',
      env: { ...process.env, PATH: join(folder, 'bin') + ':' + process.env.PATH },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const removed = (await readFile(log, 'utf8')).trim().split('\n');
    assert.equal(removed.length, 9);
    assert.equal(new Set(removed).size, 9);
    assert.ok(removed.includes('@techinject/contracts'));
    assert.ok(removed.includes('@techinject/sveltekit-server'));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('npm 12 wrapped integrity response safely retries an already-published reviewed artifact', async () => {
  const folder = await registryFixture();
  try {
    const artifact = Buffer.from('isolated reviewed fixture');
    const filename = 'core.tgz';
    const artifactFolder = join(folder, 'artifacts/0.1.0-alpha.2');
    await mkdir(artifactFolder, { recursive: true });
    await writeFile(join(artifactFolder, filename), artifact);
    await writeFile(
      join(artifactFolder, 'manifest.json'),
      JSON.stringify({
        sourceDirty: false,
        packages: [{ name: '@techinject/core', version: '0.1.0-alpha.2', filename }],
      }),
    );
    await writeFile(
      join(artifactFolder, 'SHA256SUMS.txt'),
      createHash('sha256').update(artifact).digest('hex') + '  ' + filename + '\n',
    );
    const integrity = 'sha512-' + createHash('sha512').update(artifact).digest('base64');
    const mock = join(folder, 'bin/npm');
    await writeFile(
      mock,
      `#!/usr/bin/env node
if (process.argv[2] !== 'view') process.exit(2);
console.log(JSON.stringify([${JSON.stringify(integrity)}]));
`,
    );
    await chmod(mock, 0o755);
    const result = spawnSync(process.execPath, [join(folder, 'scripts/publish-packages.mjs')], {
      cwd: folder,
      encoding: 'utf8',
      env: { ...process.env, PATH: join(folder, 'bin') + ':' + process.env.PATH },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Already published: @techinject\/core@0.1.0-alpha.2/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test('ambiguous npm registry responses fail closed', () => {
  assert.throws(() => registryField('[]'));
  assert.throws(() => registryField('["one","two"]'));
  assert.throws(() => registryField('[["nested"]]'));
});
