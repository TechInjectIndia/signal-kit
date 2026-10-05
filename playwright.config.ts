import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    command: 'pnpm --filter @signalkit/example-nextjs start',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
