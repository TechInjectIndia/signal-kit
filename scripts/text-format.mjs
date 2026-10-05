import { readFile, writeFile } from 'node:fs/promises';
import { files, isText, label } from './files.mjs';

const mode = process.argv[2];
if (!['--check', '--write'].includes(mode)) {
  console.error('Usage: node scripts/text-format.mjs --check|--write');
  process.exit(2);
}
let failures = 0;
for (const path of await files()) {
  if (!isText(path)) continue;
  const original = await readFile(path, 'utf8');
  const normalized = original
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+$/gm, '')
    .replace(/\n*$/, '\n');
  if (original === normalized) continue;
  if (mode === '--write') await writeFile(path, normalized);
  else {
    console.error(`Formatting: ${label(path)}`);
    failures++;
  }
}
if (failures) process.exitCode = 1;
else console.log(mode === '--write' ? 'Text formatting normalized.' : 'Text formatting passed.');
