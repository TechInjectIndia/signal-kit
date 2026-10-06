import { defineConfig } from '@playwright/test';
const canonical = new URL(process.env.SITE_URL ?? 'https://techinjectindia.github.io/signal-kit/');
canonical.pathname = canonical.pathname.replace(/\/+$/, '') + '/';
const preview = 'http://127.0.0.1:3300' + canonical.pathname;
export default defineConfig({
  testDir: 'tests/site',
  timeout: 30000,
  workers: 1,
  use: { baseURL: preview, javaScriptEnabled: false },
  webServer: {
    command: 'pnpm --filter @signalkit/site dev',
    url: preview,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
