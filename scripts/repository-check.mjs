import { access, readFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { files, root, label } from './files.mjs';

let failures = 0;
const fail = (message) => { console.error(message); failures++; };
const required = ['README.md', 'LICENSE', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'SUPPORT.md', 'GOVERNANCE.md', 'CHANGELOG.md', 'AGENTS.md', 'package.json', 'pnpm-lock.yaml', 'docs/PRD.md', 'docs/ARCHITECTURE.md', 'docs/ROADMAP.md', 'docs/MAINTAINING.md', 'docs/COMPATIBILITY.md', '.github/workflows/ci.yml', '.github/dependabot.yml', '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml', '.github/PULL_REQUEST_TEMPLATE.md'];
for (const name of required) {
  try { await access(resolve(root, name)); } catch { fail(`Missing required file: ${name}`); }
}
for (const path of await files()) {
  const name = label(path);
  if (name.startsWith('.env') && !/\.example$/.test(name)) fail(`Unignored environment file: ${name}`);
  if (/\.(pem|key)$/.test(name)) fail(`Private-key file in workspace: ${name}`);
  if (path.endsWith('.json')) {
    try { JSON.parse(await readFile(path, 'utf8')); } catch (error) { fail(`${name}: ${error.message}`); }
  }
  if (path.endsWith('.mjs')) {
    const check = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (check.status !== 0) fail(`${name}: ${check.stderr || check.error?.message || 'Syntax check failed'}`);
  }
  if (!path.endsWith('.md')) continue;
  const markdown = (await readFile(path, 'utf8')).replace(/```[\s\S]*?```/g, '');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const local = decodeURIComponent(target.split('#')[0]);
    const resolved = resolve(dirname(path), local);
    const location = relative(root, resolved);
    if (location.startsWith('..') || isAbsolute(location)) { fail(`${name}: link escapes repository: ${target}`); continue; }
    try { await access(resolved); } catch { fail(`${name}: broken link: ${target}`); }
  }
}
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (pkg.private !== true) fail('Root workspace must be private to prevent accidental npm publishing.');
if (pkg.license !== 'MIT') fail('Package license must match LICENSE.');
const workflow = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const match of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
  if (!/^[^@]+@[a-f0-9]{40}$/.test(match[1])) fail(`Action is not pinned to a commit: ${match[1]}`);
}
if (/pull_request_target/.test(workflow)) fail('CI must not execute contributor code in a privileged PR workflow.');
if (!/contents: read/.test(workflow)) fail('CI must explicitly request read-only contents permission.');
if (failures) { console.error(`${failures} repository check(s) failed.`); process.exitCode = 1; }
else console.log('Repository structure, local documentation links, JSON, JavaScript syntax, and CI pins passed. SDK runtime checks are not implemented yet.');
