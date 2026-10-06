import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/site',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3300/signal-kit/', javaScriptEnabled: false },
  webServer: {
    command: 'pnpm --filter @signalkit/site dev',
    url: 'http://127.0.0.1:3300/signal-kit/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
