import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
const release = join(root, 'artifacts/0.1.0-alpha.1');
const checksums = (await readFile(join(release, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
for (const line of checksums) {
  const [hash, file] = line.split('  ');
  assert.equal(
    createHash('sha256')
      .update(await readFile(join(release, file)))
      .digest('hex'),
    hash,
    `Checksum ${file}`,
  );
}
const folder = await mkdtemp(join(tmpdir(), 'signalkit-alpha-install-'));
const consumer = join(folder, 'consumer');
try {
  const installed = spawnSync(process.execPath, [join(release, 'install-local.mjs'), consumer], {
    encoding: 'utf8',
    env: process.env,
  });
  assert.equal(installed.status, 0, installed.stdout + '\n' + installed.stderr);
  const fixture = `import {createServerSignals} from '@techinject/server';import {SignalKitProvider} from '@techinject/nextjs';import {createNextSignals} from '@techinject/nextjs-server';import {instrumentBunFetch} from '@techinject/bun';const events=[];const sdk=createServerSignals({consent:{analytics:true,marketing:false,observability:false},providers:[{name:'fixture',category:'analytics',send(event){events.push(event)}}]});await sdk.track({name:'page_view',properties:{page_path:'/alpha?private=1'}});if(events.length!==1||events[0].properties.page_path!=='/alpha'||typeof SignalKitProvider!=='function'||typeof createNextSignals!=='function'||typeof instrumentBunFetch!=='function')throw new Error('Alpha import/dispatch failed');`;
  const checked = spawnSync(process.execPath, ['--input-type=module', '-e', fixture], {
    cwd: consumer,
    encoding: 'utf8',
  });
  assert.equal(checked.status, 0, checked.stderr);
  const refused = spawnSync(process.execPath, [join(release, 'install-local.mjs'), consumer], {
    encoding: 'utf8',
  });
  assert.notEqual(refused.status, 0, 'Must refuse overwrite');
  console.log(
    `${checksums.length} release checksums, fresh alpha consumer imports/dispatch, and overwrite refusal passed`,
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
