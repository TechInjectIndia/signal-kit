import { test, expect } from 'vitest';
import { createSvelteKitClient } from './index.js';
test('construction is SSR-safe but mounting is rejected without a browser', () => {
  const client = createSvelteKitClient();
  expect(() => client.mount()).toThrow('onMount');
  client.dispose();
});
