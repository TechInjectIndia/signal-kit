import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { root } from './files.mjs';
const output = join(root, 'packages/features/signals/browser/dist/cdn');
await mkdir(output, { recursive: true });
await build({
  stdin: {
    contents:
      "export * from './packages/features/signals/browser/dist/index.js'; export * from './packages/features/signals/browser/dist/dashboard.js';",
    resolveDir: root,
  },
  outfile: join(output, 'signalkit.mjs'),
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
const require = createRequire(join(root, 'packages/features/signals/contracts/package.json'));
const zodLicense = await readFile(
  join(dirname(require.resolve('zod/package.json')), 'LICENSE'),
  'utf8',
);
await writeFile(
  join(output, 'LICENSES.txt'),
  `${await readFile(join(root, 'LICENSE'), 'utf8')}\n\nBundled Zod:\n${zodLicense}`,
);
