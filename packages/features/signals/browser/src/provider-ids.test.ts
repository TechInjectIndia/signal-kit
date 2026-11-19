// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSignals } from './index.js';
import { createGA4Provider, createMetaPixelProvider } from './providers.js';
import type { Provider } from '@techinject/contracts';

const denied = { analytics: false, marketing: false, observability: false };
const analytics = { ...denied, analytics: true };
const both = { analytics: true, marketing: true, observability: false };
// Synthetic first-party cookie values only.
const COOKIES = {
  _ga: 'GA1.1.111222333.1700000000',
  _ga_TEST123: 'GS1.1.1700000001.1.1.1700000002.0.0.0',
  _fbp: 'fb.1.1700000000000.987654321',
};

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  localStorage.clear();
  for (const name of ['_ga', '_ga_TEST123', '_fbp', '_fbc'])
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  const globals = window as unknown as Record<string, unknown>;
  for (const key of ['dataLayer', 'gtag', 'fbq']) delete globals[key];
});
function setCookies(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) document.cookie = `${name}=${value}; path=/`;
}
function create(consent = denied, attribution: boolean | { category: 'analytics' } = true) {
  const sdk = createBrowserSignals({
    consent,
    autoTrack: false,
    attribution,
    providers: [
      createGA4Provider({ measurementId: 'G-TEST123' }),
      createMetaPixelProvider({ pixelId: '123456' }),
    ],
  });
  disposals.push(sdk.dispose);
  return sdk;
}

describe('getProviderIds (R5, fixture evidence with synthetic cookies)', () => {
  it('returns {} while every category is denied', async () => {
    setCookies(COOKIES);
    expect(await create().getProviderIds()).toEqual({});
  });
  it('returns only GA4 identifiers under analytics-only consent', async () => {
    setCookies(COOKIES);
    expect(await create(analytics).getProviderIds()).toEqual({
      ga4: { clientId: '111222333.1700000000', sessionId: '1700000001' },
    });
  });
  it('derives fbc from the stored fbclid when no _fbc cookie exists', async () => {
    setCookies(COOKIES);
    history.replaceState(null, '', '/?fbclid=Ab_1-x');
    const sdk = create(both);
    sdk.start();
    const ids = await sdk.getProviderIds();
    expect(ids.meta?.fbp).toBe(COOKIES._fbp);
    expect(ids.meta?.fbc).toMatch(/^fb\.1\.\d+\.Ab_1-x$/);
    expect(ids.ga4?.clientId).toBe('111222333.1700000000');
  });
  it('derives fbc from the first touch (with its timestamp) when the last touch has no fbclid', async () => {
    setCookies(COOKIES);
    history.replaceState(null, '', '/?fbclid=firstclick');
    const earlier = create(both);
    earlier.start();
    const firstTouch = earlier.getAttribution().first!;
    earlier.dispose();
    history.replaceState(null, '', '/?gclid=laterclick');
    const sdk = create(both);
    sdk.start();
    const touches = sdk.getAttribution();
    expect(touches.first?.clickIds?.fbclid).toBe('firstclick');
    expect(touches.last?.clickIds?.fbclid).toBeUndefined();
    expect((await sdk.getProviderIds()).meta?.fbc).toBe(`fb.1.${firstTouch.timestamp}.firstclick`);
  });
  it('prefers the _fbc cookie over the derived value', async () => {
    setCookies({ ...COOKIES, _fbc: 'fb.1.1700000000000.cookieclick' });
    history.replaceState(null, '', '/?fbclid=landing');
    const sdk = create(both);
    sdk.start();
    expect((await sdk.getProviderIds()).meta?.fbc).toBe('fb.1.1700000000000.cookieclick');
  });
  it('does not derive fbc when the attribution category is denied', async () => {
    history.replaceState(null, '', '/?fbclid=landing');
    const sdk = create({ ...denied, marketing: true }, { category: 'analytics' });
    sdk.start();
    expect(await sdk.getProviderIds()).toEqual({});
  });
  it('resolves within the timeout when a provider never answers and drops malformed values', async () => {
    const hung: Provider = {
      name: 'hung',
      category: 'analytics',
      eventFamily: 'ga4',
      send: () => undefined,
      identifiers: () => new Promise(() => undefined),
    };
    const malformed: Provider = {
      name: 'malformed',
      category: 'marketing',
      eventFamily: 'meta',
      send: () => undefined,
      identifiers: () => ({ fbp: 'not-a-cookie', fbc: 'fb.1.2.ok', extra: 'x' }),
    };
    const sdk = createBrowserSignals({
      consent: both,
      autoTrack: false,
      providers: [hung, malformed],
    });
    disposals.push(sdk.dispose);
    const started = Date.now();
    expect(await sdk.getProviderIds({ timeoutMs: 1 })).toEqual({ meta: { fbc: 'fb.1.2.ok' } });
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it('drops answers when consent is withdrawn mid-lookup and after dispose', async () => {
    let answer!: (value: Record<string, string>) => void;
    const slow: Provider = {
      name: 'slow',
      category: 'analytics',
      eventFamily: 'ga4',
      send: () => undefined,
      identifiers: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    };
    const sdk = createBrowserSignals({ consent: analytics, autoTrack: false, providers: [slow] });
    disposals.push(sdk.dispose);
    const pending = sdk.getProviderIds();
    await Promise.resolve();
    await Promise.resolve();
    sdk.setConsent(denied);
    answer({ clientId: '1.2' });
    expect(await pending).toEqual({});
    sdk.setConsent(analytics);
    sdk.dispose();
    expect(await sdk.getProviderIds()).toEqual({});
  });
});
