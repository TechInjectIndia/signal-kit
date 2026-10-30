import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Runs only from reviewed main in the serialized release workflow, never fork PRs.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REPOSITORY, 'TechInjectIndia/signal-kit');
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, `${command} failed: ${result.stderr}`);
  return result.stdout.trim();
}
const branch = 'changeset-release/main';
run('gh', ['auth', 'setup-git']);
run('git', ['fetch', 'origin']);
run('git', ['switch', '-C', branch, 'origin/main']);
run('bun', ['run', 'release:version']);
run('git', ['add', '.changeset', 'packages/features/signals', 'bun.lock']);
if (!run('git', ['diff', '--cached', '--name-only'])) process.exit(0);
run('git', ['config', 'user.name', 'github-actions[bot]']);
run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
run('git', ['commit', '-m', 'Version Packages']);
// Updates only this generator-owned branch; main is never pushed or force updated.
run('git', ['push', '--force-with-lease', 'origin', `HEAD:refs/heads/${branch}`]);
const prs = JSON.parse(
  run('gh', [
    'pr',
    'list',
    '--head',
    branch,
    '--base',
    'main',
    '--state',
    'open',
    '--json',
    'number',
  ]),
);
const body =
  'Changesets version update for the fixed @techinject package group. Review changelogs, package versions and CI before merging. npm publication remains behind the npm-release human review environment.';
if (prs.length)
  run('gh', ['pr', 'edit', String(prs[0].number), '--title', 'Version Packages', '--body', body]);
else
  run('gh', [
    'pr',
    'create',
    '--head',
    branch,
    '--base',
    'main',
    '--title',
    'Version Packages',
    '--body',
    body,
  ]);
