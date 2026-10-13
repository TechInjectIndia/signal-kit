import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseTag } from './release-policy.mjs';
import { mkdtemp, cp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './files.mjs';
test('Changesets produces one numbered alpha and changelogs for all nine packages', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'signalkit-version-'));
  try {
    for (const file of ['package.json', 'pnpm-workspace.yaml'])
      await cp(join(root, file), join(folder, file));
    await cp(join(root, '.changeset'), join(folder, '.changeset'), { recursive: true });
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
