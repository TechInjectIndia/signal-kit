import { readFile } from 'node:fs/promises';
import { files, root } from './files.mjs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const allowed = {
  contracts: ['zod'],
  core: ['@signalkit/contracts'],
  browser: ['@signalkit/core', '@signalkit/contracts'],
  server: ['@signalkit/core', '@signalkit/contracts'],
  nextjs: ['@signalkit/browser', '@signalkit/contracts'],
  'nextjs-server': ['@signalkit/core', '@signalkit/contracts', '@signalkit/server', '@vercel/otel'],
  bun: ['@signalkit/server', '@signalkit/contracts'],
};
for (const [name, dependencies] of Object.entries(allowed)) {
  const path = join(root, 'packages/features/signals', name);
  const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(manifest.dependencies ?? {}))
    assert.ok(dependencies.includes(dependency), `${name} forbidden dependency ${dependency}`);
  for (const file of await files(join(path, 'src'))) {
    if (file.includes('.test.')) continue;
    const source = await readFile(file, 'utf8');
    assert.ok(
      !/from\s+['"](?:.*examples\/|.*apps\/|\.\.\/.*\/src\/)/.test(source),
      `${file}: internal cross-boundary import`,
    );
    if (['contracts', 'core', 'browser', 'nextjs'].includes(name))
      assert.ok(
        !/from\s+['"](?:node:|@signalkit\/server|@signalkit\/bun|@signalkit\/nextjs-server)/.test(
          source,
        ),
        `${name} imports server code`,
      );
    assert.ok(
      !/process\.env/.test(source),
      `${name}: inject config rather than reading environment`,
    );
  }
}
console.log('SDK dependency and source boundaries passed');

for (const [consumer, forbidden] of [
  ['@signalkit/nextjs', /server|bun/],
  ['@signalkit/server', /browser|nextjs|example/],
  ['@signalkit/site', /@signalkit\/(contracts|core|browser|server|bun|nextjs|example)/],
]) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'turbo', 'run', 'build', `--filter=${consumer}`, '--dry=json'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const graph = JSON.parse(result.stdout);
  assert.ok(
    !graph.tasks.some((task) => forbidden.test(task.taskId)),
    `${consumer}: unrelated runtime in build graph`,
  );
  console.log(`${consumer} build graph: ${graph.tasks.map((task) => task.taskId).join(', ')}`);
}
