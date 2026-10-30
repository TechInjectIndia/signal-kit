import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('demo keeps credentials out of browser and pages non-indexable', async () => {
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../app/shell.tsx', import.meta.url), 'utf8');
  const publicConfig = await readFile(new URL('../signalkit.config.ts', import.meta.url), 'utf8');
  assert.match(layout, /index:\s*false/);
  assert.doesNotMatch(shell, /accessToken|api_secret/);
  assert.doesNotMatch(shell, /process\.env\.NEXT_PUBLIC_GA4_ID/);
  assert.match(shell, /createGA4Provider\(\{ measurementId: GA4_MEASUREMENT_ID \}\)/);
  assert.match(shell, /createMetaPixelProvider\(\{ pixelId: META_PIXEL_ID \}\)/);
  assert.match(shell, /createClarityProvider\(\{ projectId: CLARITY_PROJECT_ID \}\)/);
  assert.match(publicConfig, /ENABLE_EXTERNAL_PROVIDERS = false/);
  assert.doesNotMatch(publicConfig, /process\.env|accessToken|RAZORPAY_WEBHOOK_SECRET/);
  assert.match(shell, /analytics:\s*false,\s*marketing:\s*false,\s*observability:\s*false/);
});
