// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import * as kit from './index.js';
import { createSvelteKitClient } from './index.js';
test('mount is idempotent, navigation records once, consent drops and dispose restores patches', async () => {
  history.replaceState({}, '', '/');
  const send = vi.fn();
  const original = history.pushState;
  const client = createSvelteKitClient({
    consent: { analytics: true, marketing: false, observability: false },
    providers: [{ name: 'local', category: 'analytics', send }],
  });
  expect(() => client.getSignals()).toThrow('not mounted');
  const signals = client.mount();
  expect(client.mount()).toBe(signals);
  history.pushState({}, '', '/catalog?secret=1');
  history.replaceState({}, '', '/catalog?secret=2');
  await signals.flush();
  expect(send.mock.calls.map(([event]) => event.properties.page_path)).toEqual(['/', '/catalog']);
  signals.setConsent({ analytics: false, marketing: false, observability: false });
  history.pushState({}, '', '/checkout');
  await signals.flush();
  expect(send).toHaveBeenCalledTimes(2);
  client.dispose();
  expect(history.pushState).toBe(original);
  client.dispose();
});

test('exports adapter and browser APIs', () => {
  expect(typeof kit.createSvelteKitClient).toBe('function');
  expect(typeof kit.createGA4Provider).toBe('function');
});

test('pageOnConsent fires after start when consent is granted post-mount', async () => {
  history.replaceState({}, '', '/landing');
  const send = vi.fn();
  const client = createSvelteKitClient({
    consent: { analytics: false, marketing: false, observability: false },
    pageOnConsent: true,
    providers: [{ name: 'local', category: 'analytics', eventFamily: 'ga4', send }],
  });
  const signals = client.mount();
  await signals.flush();
  expect(send).not.toHaveBeenCalled();
  signals.setConsent({ analytics: true, marketing: false, observability: false });
  await signals.flush();
  expect(send).toHaveBeenCalledTimes(1);
  client.dispose();
});
