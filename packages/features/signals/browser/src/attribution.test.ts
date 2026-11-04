// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSignals } from './index.js';
import { createGA4Provider } from './providers.js';
const consent = { analytics: true, marketing: true, observability: false };
const denied = { analytics: false, marketing: false, observability: false };
const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  localStorage.clear();
  document.head.innerHTML = '';
});
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    size: () => map.size,
  };
}
describe('first-party visit source capture', () => {
  it('is off by default and captures the landing URL before the router rewrites it', () => {
    const off = createBrowserSignals({ consent });
    disposals.push(off.dispose);
    expect(off.getAttribution()).toEqual({});
    off.stop();
    history.replaceState(null, '', '/landing?gclid=abc&utm_campaign=spring&token=secret');
    const sdk = createBrowserSignals({ consent, attribution: true });
    disposals.push(sdk.dispose);
    history.replaceState(null, '', '/landing');
    const { first, last } = sdk.getAttribution();
    expect(first).toMatchObject({ channel: 'paid_search', source: 'google', campaign: 'spring' });
    expect(last).toEqual(first);
    expect(JSON.stringify(sdk.getAttribution())).not.toContain('secret');
    expect(localStorage.getItem('signalkit.attribution')).toContain('paid_search');
  });
  it('keeps the source in memory only until consent, then persists and clears on withdrawal', () => {
    const storage = memoryStorage();
    history.replaceState(null, '', '/?msclkid=m1&utm_term=field+notebook');
    const sdk = createBrowserSignals({ attribution: { storage }, autoTrack: false });
    disposals.push(sdk.dispose);
    sdk.start();
    expect(sdk.getAttribution().last).toMatchObject({ source: 'bing', term: 'field notebook' });
    expect(storage.size()).toBe(0);
    sdk.setConsent({ ...denied, marketing: true });
    expect(storage.size()).toBe(1);
    sdk.setConsent(denied);
    expect(storage.size()).toBe(0);
    sdk.setConsent({ ...denied, analytics: true });
    expect(storage.size()).toBe(0);
  });
  it('preserves first touch, updates last touch, ignores direct and internal visits and expires', () => {
    const storage = memoryStorage();
    const now = Date.now();
    storage.setItem(
      'signalkit.attribution',
      JSON.stringify({
        first: {
          channel: 'organic_search',
          source: 'google',
          medium: 'organic',
          landingPath: '/',
          timestamp: now - 10 * 86_400_000,
        },
        last: {
          channel: 'paid_social',
          source: 'facebook',
          medium: 'paid_social',
          landingPath: '/',
          timestamp: now - 400 * 86_400_000,
        },
      }),
    );
    history.replaceState(null, '', '/?utm_source=crm&utm_medium=email');
    const sdk = createBrowserSignals({
      consent,
      attribution: { storage, category: 'analytics', maxAgeDays: 90 },
    });
    disposals.push(sdk.dispose);
    expect(sdk.getAttribution()).toMatchObject({
      first: { source: 'google' },
      last: { channel: 'email', source: 'crm' },
    });
    sdk.stop();
    history.replaceState(null, '', '/cart');
    Object.defineProperty(document, 'referrer', {
      value: location.origin + '/',
      configurable: true,
    });
    const next = createBrowserSignals({ consent, attribution: { storage, category: 'analytics' } });
    disposals.push(next.dispose);
    expect(next.getAttribution()).toMatchObject({
      first: { source: 'google' },
      last: { channel: 'email' },
    });
    next.clearAttribution();
    expect(next.getAttribution()).toEqual({});
    expect(storage.size()).toBe(0);
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });
  it('survives storage that throws', () => {
    history.replaceState(null, '', '/?gclid=1');
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const sdk = createBrowserSignals({ consent, attribution: { storage } });
    disposals.push(sdk.dispose);
    expect(sdk.getAttribution().last?.channel).toBe('paid_search');
  });
});
describe('GA4 attribution fields', () => {
  it('sends campaign parameters and the referrer host but no other query or path data', async () => {
    history.replaceState(
      null,
      '',
      '/products/42?utm_source=google&utm_medium=cpc&gclid=g1&session=private',
    );
    Object.defineProperty(document, 'referrer', {
      value: 'https://www.google.com/search?q=secret+term',
      configurable: true,
    });
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')));
      return node;
    });
    const provider = createGA4Provider({ measurementId: 'G-TEST' });
    disposals.push(() => provider.dispose?.());
    await provider.send({
      name: 'page_view',
      eventId: 'e1',
      timestamp: 1,
      properties: { page_path: '/products/:id' },
    });
    const layer = JSON.stringify((window as { dataLayer?: unknown[] }).dataLayer);
    expect(layer).toContain(
      `${location.origin}/products/:id?utm_source=google&utm_medium=cpc&gclid=g1`,
    );
    expect(layer).toContain('"page_referrer":"https://www.google.com/"');
    expect(layer).not.toContain('private');
    expect(layer).not.toContain('secret');
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  });
});
