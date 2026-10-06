import { spawnSync } from 'node:child_process';
import { mkdtemp, cp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root } from './files.mjs';
import assert from 'node:assert/strict';
import { build } from '../apps/site/scripts/build.mjs';
function git(args, cwd = root) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
assert.equal(
  git(['status', '--porcelain']),
  '',
  'Commit source changes before publishing; sourceCommit must describe the actual artifact',
);
await build({ siteUrl: 'https://techinjectindia.github.io/signal-kit/' });
const dist = join(root, 'apps/site/dist');
const homepage = await readFile(join(dist, 'index.html'), 'utf8');
assert.ok(
  homepage.includes('https://techinjectindia.github.io/signal-kit/'),
  'Build with the confirmed GitHub Pages SITE_URL before publishing',
);
const remote = git(['remote', 'get-url', 'origin']);
assert.ok(
  [
    'git@github.com:TechInjectIndia/signal-kit.git',
    'https://github.com/TechInjectIndia/signal-kit.git',
  ].includes(remote),
  'Publisher is scoped to the confirmed SignalKit repository',
);
const sourceCommit = git(['rev-parse', 'HEAD']);
const sourceBranch = git(['branch', '--show-current']);
const temporary = await mkdtemp(join(tmpdir(), 'signalkit-pages-'));
try {
  const exists = git(['ls-remote', '--heads', remote, 'gh-pages']);
  if (exists) {
    git(['clone', '--depth', '1', '--single-branch', '--branch', 'gh-pages', remote, temporary]);
    const previous = JSON.parse(await readFile(join(temporary, '_signalkit-site.json'), 'utf8'));
    assert.equal(
      previous.managedBy,
      'SignalKit static publisher',
      'Refusing to overwrite an unmanaged Pages branch',
    );
    for (const entry of await readdir(temporary))
      if (entry !== '.git') await rm(join(temporary, entry), { recursive: true, force: true });
  } else git(['init', '--initial-branch=gh-pages', temporary]);
  git(['config', 'user.name', git(['config', 'user.name'])], temporary);
  git(['config', 'user.email', git(['config', 'user.email'])], temporary);
  await cp(dist, temporary, { recursive: true });
  await writeFile(
    join(temporary, '_signalkit-site.json'),
    JSON.stringify(
      {
        managedBy: 'SignalKit static publisher',
        sourceCommit,
        sourceBranch,
        siteUrl: 'https://techinjectindia.github.io/signal-kit/',
      },
      null,
      2,
    ) + '\n',
  );
  git(['add', '--all'], temporary);
  if (!git(['diff', '--cached', '--name-only'], temporary)) {
    console.log('Pages output already current');
    process.exitCode = 0;
  } else {
    git(
      ['commit', '-m', `Publish SignalKit static site from ${sourceCommit.slice(0, 7)}`],
      temporary,
    );
    git(['push', remote, 'HEAD:refs/heads/gh-pages'], temporary);
    console.log(
      `Published gh-pages artifact ${git(['rev-parse', 'HEAD'], temporary)} from ${sourceCommit}; Pages build/public HTTP verification still required`,
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
