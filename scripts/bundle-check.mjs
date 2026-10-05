import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
const result = await build({
  entryPoints: [join(root, 'packages/features/signals/browser/dist/index.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  metafile: true,
});
const output = result.outputFiles[0].contents;
const gzip = gzipSync(output).length;
assert.ok(gzip <= 30000, `Browser SDK exceeds 30kB gzip budget: ${gzip}`);
assert.ok(
  !Object.keys(result.metafile.inputs).some((path) => /\/server\/|node:|@vercel/.test(path)),
  'Server code in browser bundle',
);
console.log(
  `Browser SDK with all adapters: ${output.length} bytes minified, ${gzip} bytes gzip (30kB budget); no server imports`,
);
