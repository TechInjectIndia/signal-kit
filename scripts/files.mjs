import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set(['.git', 'node_modules', '.pnpm-store', 'dist', 'build', '.next', '.turbo', 'coverage', 'playwright-report', 'test-results']);

export async function files(directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.name === '.DS_Store') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

export function label(path) { return relative(root, path); }
export function isText(path) { return /\.(md|mjs|json|ya?ml)$/.test(path) || ['LICENSE', '.gitignore', '.editorconfig', '.gitattributes', '.nvmrc'].includes(label(path)); }
