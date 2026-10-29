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

it('renders bounded safe observability metadata separately from event outcomes', () => {
  const element = document.createElement('div');
  const signals = createSignals();
  const entries = [
    {
      backend: 'sentry',
      configured: false,
      endpoint: 'https://secret.test',
      token: 'private-token',
    },
    { backend: 'grafana', configured: true, hosting: 'cloud' },
    { backend: 'signoz', configured: true, hosting: 'local', enabled: false },
    { backend: '<img src=x onerror=alert(1)>', configured: true },
    { backend: 'otlp', configured: true },
  ];
  const unmount = mountConnectionsDashboard(element, signals, {
    observability: entries as import('./dashboard.js').ObservabilityConnection[],
  });
  const section = element.querySelector('[aria-label="Observability connections"]')!;
  expect([...section.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
    'Sentry',
    'Grafana',
    'SigNoz',
  ]);
  expect(section.textContent).toContain('Not configured');
  expect(section.textContent).toContain('Configured · delivery unverified');
  expect(section.textContent).toContain('blocked by host policy');
  expect(section.textContent).toContain('Cloud deployment');
  expect(section.textContent).toContain('Local deployment');
  expect(section.textContent).toContain('same exporter');
  expect(section.innerHTML).not.toMatch(/secret.test|private-token|onerror/);
  expect(element.querySelector('img')).toBeNull();
  signals.setConsent({ analytics: true, marketing: false, observability: true });
  expect(section.querySelectorAll('article')).toHaveLength(3);
  unmount();
  expect(element.childElementCount).toBe(0);
});

it('preserves two-argument usage and skips unknown and duplicate backends', () => {
  const element = document.createElement('div');
  const signals = createSignals();
  const unmount = mountConnectionsDashboard(element, signals);
  expect(element.querySelector('[aria-label="Observability connections"]')).toBeNull();
  unmount();
  mountConnectionsDashboard(element, signals, {
    observability: [
      { backend: '__proto__' as 'otlp', configured: true },
      { backend: 'otlp', configured: true },
      { backend: 'otlp', configured: false },
    ],
  });
  expect(element.querySelectorAll('article')).toHaveLength(1);
  expect(element.textContent).toContain('OpenTelemetry');
  expect(element.textContent).not.toContain('__proto__');
});
