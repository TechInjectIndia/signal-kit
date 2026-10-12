import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/sveltekit',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3400' },
  webServer: {
    command: 'pnpm --filter @signalkit/example-sveltekit exec node build/index.js',
    url: 'http://127.0.0.1:3400',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: { HOST: '127.0.0.1', PORT: '3400', ORIGIN: 'http://127.0.0.1:3400' },
  },
});
