// Bun is SignalKit's internal contributor tooling only. This check proves the packed
// @techinject tarballs install and run in client apps that use npm, pnpm or yarn on Node,
// or Bun, so nothing published depends on the SDK repository's own toolchain.
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { root } from './files.mjs';

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
const clients = [
  { name: 'npm', install: ['npm', ['install', '--no-audit', '--no-fund']], runtime: 'node' },
  {
    name: 'pnpm',
    install: ['npx', ['--yes', 'pnpm@10.24.0', 'install']],
    runtime: 'node',
    field: (overrides) => ({ pnpm: { overrides } }),
  },
  {
    name: 'yarn',
    install: ['npx', ['--yes', 'yarn@1.22.22', 'install', '--non-interactive']],
    runtime: 'node',
    field: (resolutions) => ({ resolutions }),
    nextBuild: false,
  },
  { name: 'bun', install: ['bun', ['install']], runtime: 'bun', nextBuild: false },
];
const only = process.argv.slice(2);
const selected = only.length ? clients.filter((client) => only.includes(client.name)) : clients;
assert.ok(selected.length, `Unknown client; choose from ${clients.map((c) => c.name).join(', ')}`);

// `bun run` puts a `node` alias for Bun on PATH; client installs must use the real Node.
const path = process.env.PATH.split(delimiter).filter((folder) => {
  const node = join(folder, 'node');
  if (!existsSync(node)) return true;
  return spawnSync(node, ['-p', 'typeof Bun'], { encoding: 'utf8' }).stdout.trim() === 'undefined';
});
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: path.join(delimiter), NEXT_TELEMETRY_DISABLED: '1' },
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

const proof = `import {createServerSignals} from '@techinject/server';
import {createNextSignals} from '@techinject/nextjs-server';
import {createSvelteKitHooks} from '@techinject/sveltekit-server';
import {instrumentBunFetch} from '@techinject/bun';
import {SignalKitProvider} from '@techinject/nextjs';
const events=[];
const sdk=createServerSignals({consent:{analytics:true,marketing:false,observability:false},providers:[{name:'proof',category:'analytics',send(event){events.push(event)}}]});
await sdk.track({name:'page_view',properties:{page_path:'/consumer?private=1'}});
if(events.length!==1||events[0].properties.page_path!=='/consumer')throw new Error('Server dispatch failed');
for(const fn of [createNextSignals,createSvelteKitHooks,instrumentBunFetch,SignalKitProvider])if(typeof fn!=='function')throw new Error('Missing export');
console.log('imports and dispatch passed');
`;
const layout = `export const metadata = { title: 'SignalKit consumer smoke', robots: { index: false } };
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
`;
const page = `'use client';
import { SignalKitProvider } from '@techinject/nextjs';
const config = { consent: { analytics: false, marketing: false, observability: false }, providers: [] };
export default function Page() {
  return <SignalKitProvider config={config}><main><h1>Consumer smoke</h1></main></SignalKitProvider>;
}
`;

const directory = await mkdtemp(join(tmpdir(), 'signalkit-consumers-'));
try {
  const tarballs = join(directory, 'tarballs');
  await mkdir(tarballs);
  const packed = {};
  for (const name of names) {
    const leaf = join(root, 'packages/features/signals', name);
    const manifest = JSON.parse(await readFile(join(leaf, 'package.json'), 'utf8'));
    for (const field of ['packageManager', 'workspaces'])
      assert.equal(manifest[field], undefined, `${manifest.name} must not declare ${field}`);
    assert.equal(manifest.engines?.bun, undefined, `${manifest.name} must not require Bun`);
    run('bun', ['pm', 'pack', '--destination', tarballs, '--quiet'], leaf);
    const filename = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;
    assert.ok((await readdir(tarballs)).includes(filename), `Missing ${filename}`);
    const contents = run('tar', ['-xzOf', join(tarballs, filename), 'package/package.json'], root);
    assert.doesNotMatch(contents, /workspace:/, `${manifest.name} leaked a workspace: range`);
    packed[manifest.name] = `file:${join(tarballs, filename)}`;
  }
  const dist = join(root, 'packages/features/signals');
  for (const name of names)
    for (const file of await readdir(join(dist, name, 'dist'), { recursive: true }))
      if (/\.(m?js)$/.test(file)) {
        const source = await readFile(join(dist, name, 'dist', file), 'utf8');
        if (name !== 'bun')
          assert.doesNotMatch(source, /from\s*['"]bun(?::[^'"]*)?['"]|\bBun\./, `${name}/${file}`);
      }

  for (const client of selected) {
    const app = join(directory, client.name);
    await mkdir(join(app, 'app'), { recursive: true });
    const nextBuild = client.nextBuild !== false;
    const dependencies = {
      ...packed,
      react: '19.3.0',
      'react-dom': '19.3.0',
      next: '16.4.1',
      '@sveltejs/kit': '3.0.1',
    };
    await writeFile(
      join(app, 'package.json'),
      JSON.stringify(
        {
          name: `signalkit-consumer-${client.name}`,
          private: true,
          type: 'module',
          dependencies,
          ...(client.field ? client.field(packed) : { overrides: packed }),
        },
        null,
        2,
      ),
    );
    await writeFile(join(app, 'proof.mjs'), proof);
    run(client.install[0], client.install[1], app);
    const output = run(client.runtime, ['proof.mjs'], app);
    let built = '';
    if (nextBuild) {
      await writeFile(join(app, 'app/layout.jsx'), layout);
      await writeFile(join(app, 'app/page.jsx'), page);
      run(client.runtime, ['node_modules/next/dist/bin/next', 'build'], app);
      built = ', next build passed';
    }
    const runtime = run(client.runtime, ['--version'], app);
    console.log(`${client.name} client on ${client.runtime} ${runtime}: ${output}${built}`);
  }
  console.log(`Consumer smoke passed for ${selected.map((client) => client.name).join(', ')}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
