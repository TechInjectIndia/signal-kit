import { mkdtemp, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './files.mjs';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(tmpdir(), 'signalkit-pack-'));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, `${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  const names = ['contracts', 'core', 'browser', 'server', 'nextjs', 'nextjs-server', 'bun'];
  for (const name of names) {
    const leaf = join(root, 'packages/features/signals', name);
    run('pnpm', ['pack', '--pack-destination', directory], leaf);
  }
  const tarballs = (await readdir(directory)).filter((name) => name.endsWith('.tgz'));
  for (const tarball of tarballs) {
    const contents = run('tar', ['-tzf', join(directory, tarball)], directory);
    assert.match(contents, /package\/dist\/index\.js/);
    assert.match(contents, /package\/dist\/index\.d\.ts/);
    assert.doesNotMatch(contents, /node_modules|\.env|\.test\./);
    assert.match(contents, /package\/LICENSE/);
  }
  const dependencies = { react: '19.3.0' };
  const overrides = {};
  for (const name of names) {
    const manifest = JSON.parse(
      await readFile(join(root, 'packages/features/signals', name, 'package.json'), 'utf8'),
    );
    const filename = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
    const tarball = tarballs.find((file) => file === filename);
    assert.ok(tarball, `Missing ${name} tarball`);
    dependencies[manifest.name] = `file:${join(directory, tarball)}`;
    overrides[manifest.name] = `file:${join(directory, tarball)}`;
  }
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'signalkit-standalone-proof',
      private: true,
      type: 'module',
      dependencies,
      pnpm: { overrides },
    }),
  );
  await writeFile(join(directory, '.npmrc'), 'auto-install-peers=false\n');
  run('pnpm', ['install', '--prefer-offline'], directory);
  await writeFile(
    join(directory, 'proof.mjs'),
    `import {createSignals} from '@techinject/core';
import {createBrowserSignals} from '@techinject/browser';
import {createServerSignals} from '@techinject/server';
import {instrumentBunFetch} from '@techinject/bun';
import {SignalKitProvider} from '@techinject/nextjs';
import {createNextSignals} from '@techinject/nextjs-server';
const events=[];const sdk=createSignals({consent:{analytics:true,marketing:false,observability:false},providers:[{name:'proof',category:'analytics',send(event){events.push(event)}}]});
await sdk.track({name:'page_view',properties:{page_path:'/proof?private=1'}});
if(events.length!==1||events[0].properties.page_path!=='/proof')throw new Error('Standalone dispatch failed');
if(typeof createBrowserSignals!=='function'||typeof createServerSignals!=='function'||typeof instrumentBunFetch!=='function'||typeof SignalKitProvider!=='function'||typeof createNextSignals!=='function')throw new Error('Exports failed');
console.log('Standalone tarball imports and dispatch passed');`,
  );
  console.log(run(process.execPath, ['proof.mjs'], directory).trim());
  console.log(
    `${tarballs.length} package tarballs contain declarations, runtime exports and license; no tests/env/node_modules`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
