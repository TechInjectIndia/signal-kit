// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createSignals } from '@techinject/core';
import { mountConnectionsDashboard } from './dashboard.js';

it('renders safe live status, empty state and cleans up only its own subtree', async () => {
  const element = document.createElement('div');
  element.textContent = 'Host content';
  const signals = createSignals({
    providers: [{ name: '<img src=x onerror=alert(1)>', category: 'analytics', send() {} }],
  });
  const unmount = mountConnectionsDashboard(element, signals);
  expect(element.textContent).toContain('Blocked by consent');
  expect(element.querySelector('img')).toBeNull();
  signals.setConsent({ analytics: true, marketing: false, observability: false });
  expect(element.textContent).toContain('no outcomes yet');
  await signals.track({ name: 'page_view', properties: { page_path: '/' } });
  expect(element.textContent).toContain('SDK send completed');
  signals.setConsent({ analytics: false, marketing: false, observability: false });
  expect(element.textContent).toContain('Blocked by consent');
  unmount();
  expect(element.textContent).toBe('Host content');
  mountConnectionsDashboard(element, createSignals());
  expect(element.textContent).toContain('No event providers configured');
});
