import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('demo keeps credentials out of browser and pages non-indexable', async () => {
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../app/shell.tsx', import.meta.url), 'utf8');
  assert.match(layout, /index:\s*false/);
  assert.doesNotMatch(shell, /accessToken|api_secret/);
  assert.match(shell, /analytics:\s*false,\s*marketing:\s*false,\s*observability:\s*false/);
});
