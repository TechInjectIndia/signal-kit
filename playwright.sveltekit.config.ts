import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { defineConfig } from '@playwright/test';
// `bun run` puts a `node` alias for Bun on PATH. The SvelteKit adapter-node app is
// verified on real Node, matching the client hosts that use it.
const realNodePath = (process.env.PATH ?? '')
  .split(delimiter)
  .filter((folder) => {
    const node = join(folder, 'node');
    if (!existsSync(node)) return true;
    return (
      spawnSync(node, ['-p', 'typeof Bun'], { encoding: 'utf8' }).stdout.trim() === 'undefined'
    );
  })
  .join(delimiter);
export default defineConfig({
  testDir: 'tests/sveltekit',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3400' },
  webServer: {
    command: 'node build/index.js',
    cwd: 'examples/sveltekit',
    url: 'http://127.0.0.1:3400',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: { HOST: '127.0.0.1', PORT: '3400', ORIGIN: 'http://127.0.0.1:3400', PATH: realNodePath },
  },
});
