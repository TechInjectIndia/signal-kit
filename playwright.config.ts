import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    // Run Next directly so Playwright stops it (a `bun run` wrapper leaves it orphaned).
    command: 'bun --bun next start --port 3100',
    cwd: 'examples/nextjs',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
