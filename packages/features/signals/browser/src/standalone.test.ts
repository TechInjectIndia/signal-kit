// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  window.signals?.dispose();
  delete window.signals;
  vi.restoreAllMocks();
  vi.doUnmock('./providers.js');
});

it('keeps providers denied without data-auto-consent until the host grants consent', async () => {
  const ga4Send = vi.fn();
  const metaSend = vi.fn();
  const claritySend = vi.fn();
  vi.doMock('./providers.js', () => ({
    createGA4Provider: () => ({ name: 'ga4', category: 'analytics', send: ga4Send }),
    createMetaPixelProvider: () => ({ name: 'meta-pixel', category: 'marketing', send: metaSend }),
    createClarityProvider: () => ({ name: 'clarity', category: 'analytics', send: claritySend }),
  }));

  const script = document.createElement('script');
  script.setAttribute('data-ga4-id', 'G-TEST123');
  script.setAttribute('data-meta-id', '123456789');
  script.setAttribute('data-clarity-id', 'test123');
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');

  await import('./standalone.js');
  const signals = window.signals!;
  expect(signals.getConsent()).toEqual({
    analytics: false,
    marketing: false,
    observability: false,
  });
  await signals.page();
  await signals.flush();
  expect(ga4Send).not.toHaveBeenCalled();
  expect(metaSend).not.toHaveBeenCalled();
  expect(claritySend).not.toHaveBeenCalled();

  signals.setConsent({ analytics: true, marketing: true, observability: true });
  await signals.page();
  await signals.flush();
  expect(ga4Send).toHaveBeenCalledOnce();
  expect(metaSend).toHaveBeenCalledOnce();
  expect(claritySend).toHaveBeenCalledOnce();
});
