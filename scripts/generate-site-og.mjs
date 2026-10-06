import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory = new URL('../apps/site/public/', import.meta.url);
const svg = await readFile(new URL('og.svg', directory), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>body{margin:0}svg{display:block;width:1200px;height:630px}</style>${svg}`,
  );
  await page.screenshot({ path: fileURLToPath(new URL('og.png', directory)), type: 'png' });
} finally {
  await browser.close();
}
console.log('Generated apps/site/public/og.png from checked-in SVG');
