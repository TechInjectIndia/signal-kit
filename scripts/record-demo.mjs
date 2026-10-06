import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { root } from './files.mjs';
const temporary = await mkdtemp(join(tmpdir(), 'signalkit-demo-'));
const assets = join(root, 'docs/assets');
const site = join(root, 'apps/site/public');
await mkdir(assets, { recursive: true });
await mkdir(site, { recursive: true });
const child = spawn(
  'pnpm',
  [
    '--filter',
    '@signalkit/example-nextjs',
    'exec',
    'next',
    'start',
    '--port',
    '3112',
    '--hostname',
    '127.0.0.1',
  ],
  {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let logs = '';
child.stdout.on('data', (chunk) => (logs += chunk));
child.stderr.on('data', (chunk) => (logs += chunk));
let browser;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch('http://127.0.0.1:3112')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await pause(100);
  }
  assert.ok(ready, 'Demo host failed: ' + logs);
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: temporary, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3112');
  await page.getByRole('status').waitFor();
  await pause(1800);
  await page.getByLabel('analytics', { exact: true }).check();
  await pause(600);
  await page.getByLabel('observability', { exact: true }).check();
  await pause(1800);
  await page.getByRole('link', { name: 'Open the sample store' }).click();
  await page.waitForURL(/\/catalog$/);
  await pause(1800);
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await pause(1800);
  await page.getByRole('button', { name: 'Test API' }).click();
  await page
    .getByRole('list', { name: 'Recorded activity' })
    .getByText(/GET \/api\/ping/)
    .waitFor();
  await pause(1500);
  await page.screenshot({ path: join(assets, 'demo-poster.png') });
  await page.screenshot({ path: join(site, 'demo-poster.png') });
  await page.getByLabel('analytics', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Track this page' }).click();
  await pause(1800);
  const video = page.video();
  await context.close();
  const input = await video.path();
  const mp4 = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      input,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '25',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      join(site, 'demo.mp4'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(mp4.status, 0, mp4.stderr);
  const gif = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      input,
      '-filter_complex',
      'fps=8,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      '-loop',
      '0',
      join(assets, 'demo.gif'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(gif.status, 0, gif.stderr);
  console.log(
    'Recorded actual consent/navigation/cart/API/withdrawal local demo; provider transports are local recorders only',
  );
} finally {
  if (browser) await browser.close();
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  await rm(temporary, { recursive: true, force: true });
}
