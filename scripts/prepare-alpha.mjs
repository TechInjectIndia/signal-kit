import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
const version = '0.1.0-alpha.1';
const names = ['contracts', 'core', 'browser', 'server', 'nextjs', 'nextjs-server', 'bun'];
const output = resolve(root, 'artifacts', version);
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const packages = [];
for (const name of names) {
  const leaf = join(root, 'packages/features/signals', name);
  const manifest = JSON.parse(await readFile(join(leaf, 'package.json'), 'utf8'));
  assert.equal(manifest.version, version);
  assert.equal(manifest.name, `@techinject/${name}`);
  run('pnpm', ['pack', '--pack-destination', output], leaf);
  const filename = `techinject-${name}-${version}.tgz`;
  const contents = run('tar', ['-tzf', join(output, filename)]);
  assert.match(contents, /package\/dist\/index\.d\.ts/);
  assert.match(contents, /package\/LICENSE/);
  assert.doesNotMatch(contents, /\.env|node_modules|\.test\./);
  packages.push({
    name: manifest.name,
    version,
    filename,
    dependencies: manifest.dependencies ?? {},
    peerDependencies: manifest.peerDependencies ?? {},
  });
}
await build({
  entryPoints: [join(root, 'packages/features/signals/browser/dist/index.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: join(output, 'signalkit-browser.mjs'),
});
const zodRequire = createRequire(join(root, 'packages/features/signals/contracts/package.json'));
await writeFile(
  join(output, 'ZOD-LICENSE.txt'),
  await readFile(join(dirname(zodRequire.resolve('zod/package.json')), 'LICENSE')),
);
await writeFile(join(output, 'SIGNALKIT-LICENSE.txt'), await readFile(join(root, 'LICENSE')));
const commit = run('git', ['rev-parse', 'HEAD']);
const sourceDirty = run('git', ['status', '--porcelain']) !== '';
await writeFile(
  join(output, 'manifest.json'),
  JSON.stringify(
    {
      version,
      sourceCommit: commit,
      sourceDirty,
      registryStatus: 'unpublished; npm ownership/authentication and human review pending',
      packages,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  join(output, 'install-local.mjs'),
  `import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const release=fileURLToPath(new URL('./',import.meta.url));
const target=resolve(process.argv[2]??'signalkit-alpha-consumer');
try {await access(join(target,'package.json'));throw new Error('Choose a fresh consumer directory; existing package.json will not be overwritten');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(target,{recursive:true});
const manifest=JSON.parse(await readFile(join(release,'manifest.json'),'utf8'));
const dependencies={react:'19.3.0'};const overrides={};
for(const pkg of manifest.packages){dependencies[pkg.name]='file:'+join(release,pkg.filename);overrides[pkg.name]=dependencies[pkg.name];}
await writeFile(join(target,'package.json'),JSON.stringify({name:'signalkit-alpha-consumer',private:true,type:'module',dependencies,pnpm:{overrides}},null,2)+String.fromCharCode(10));
await writeFile(join(target,'.npmrc'),'auto-install-peers=false'+String.fromCharCode(10));
const result=spawnSync('pnpm',['install'],{cwd:target,stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
console.log('Installed local alpha in '+target+'; registry publication is not implied');
`,
);
await writeFile(
  join(output, 'README.txt'),
  `SignalKit ${version} release candidate. NOT PUBLISHED.\n\nUse Node22 + pnpm10.24.0. In a fresh directory:\nnode install-local.mjs /path/to/fresh-consumer\n\nAll seven SDK tarballs use local overrides so no unpublished @techinject package is fetched from npm. External dependencies still use the normal registry. Browser-only JavaScript can import the bundled signalkit-browser.mjs with modern browser APIs. No framework or global JavaScript exception support beyond documented targets is implied.\n\nHuman review: inspect docs/releases/0.1.0-alpha.1.md and ALPHA-REVIEW.md. npm account/scope ownership, login, release authorization and provider account validation remain separate. Never store tokens in this folder.\n`,
);
const files = (await readdir(output)).filter((name) => name !== 'SHA256SUMS.txt').sort();
const sums = await Promise.all(
  files.map(
    async (filename) =>
      `${createHash('sha256')
        .update(await readFile(join(output, filename)))
        .digest('hex')}  ${filename}`,
  ),
);
await writeFile(join(output, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
console.log(
  `Prepared ${packages.length} verified SDK tarballs, standalone browser module, local installer and checksums in ${output}; no publication performed`,
);
