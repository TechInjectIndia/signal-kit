// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSignals } from './index.js';
import { createGA4Provider, createMetaPixelProvider } from './providers.js';
import type { SignalEvent } from '@techinject/contracts';

const denied = { analytics: false, marketing: false, observability: false };
const analytics = { ...denied, analytics: true };
const both = { analytics: true, marketing: true, observability: false };

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  document.head.innerHTML = '';
  const globals = window as unknown as Record<string, unknown>;
  for (const key of ['dataLayer', 'gtag', 'fbq']) delete globals[key];
});
function autoLoadScripts() {
  const appended: string[] = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    appended.push((node as HTMLScriptElement).src);
    queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')));
    return node;
  });
  return appended;
}
function ga4Events(): unknown[][] {
  const layer = (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [];
  return layer.map((entry) => Array.from(entry)).filter((args) => args[0] === 'event');
}
const lastLocation = () =>
  new URL((ga4Events().at(-1)![2] as Record<string, string>).page_location!);
const purchase = {
  name: 'purchase',
  properties: {
    transaction_id: 'ORDER-TEST-1',
    currency: 'INR',
    value: 10,
    items: [{ item_id: 'sku-1', price: 10, quantity: 1 }],
  },
} as const;

describe('page context location (R10, fixture evidence)', () => {
  it('builds GA4 page_location from hash routes and explicit page paths', async () => {
    autoLoadScripts();
    history.replaceState(null, '', '/#/products');
    const sdk = createBrowserSignals({
      consent: analytics,
      trackHash: true,
      providers: [createGA4Provider({ measurementId: 'G-TEST123' })],
    });
    disposals.push(sdk.dispose);
    await sdk.flush();
    expect(lastLocation().pathname).toBe('/products');
    expect(lastLocation().hash).toBe('');

    await sdk.page('/virtual');
    expect(lastLocation().pathname).toBe('/virtual');
    // Later events on the same URL keep the explicit route.
    await sdk.track(purchase);
    expect(lastLocation().pathname).toBe('/virtual');

    history.pushState(null, '', '/app/#/orders/42');
    await sdk.flush();
    expect(lastLocation().pathname).toBe('/app/orders/:id');
  });
  it('keeps ordinary path routes and allowlisted query parameters unchanged', async () => {
    autoLoadScripts();
    history.replaceState(null, '', '/shop/shoes?utm_source=news&secret=x');
    const events: SignalEvent[] = [];
    const sdk = createBrowserSignals({
      consent: analytics,
      providers: [
        {
          name: 'recorder',
          category: 'analytics',
          eventFamily: 'ga4',
          send: (event) => {
            events.push(event);
          },
        },
      ],
    });
    disposals.push(sdk.dispose);
    await sdk.flush();
    expect(events[0]!.context?.page?.location).toBe(
      `${location.origin}/shop/shoes?utm_source=news`,
    );
    expect(JSON.stringify(events)).not.toContain('secret');
  });
});

describe('browser track options (G4, runtime evidence in jsdom)', () => {
  it('routes a purchase to the Pixel only with categories', async () => {
    autoLoadScripts();
    const sdk = createBrowserSignals({
      consent: both,
      autoTrack: false,
      providers: [
        createGA4Provider({ measurementId: 'G-TEST123' }),
        createMetaPixelProvider({ pixelId: '123456' }),
      ],
    });
    disposals.push(sdk.dispose);
    const result = await sdk.track(purchase, { categories: ['marketing'] });
    expect(result.outcomes).toEqual([
      { provider: 'ga4', status: 'skipped', reason: 'not_targeted' },
      { provider: 'meta-pixel', status: 'sent' },
    ]);
    const malformed = await sdk.track(purchase, { categories: 'marketing' } as never);
    expect(malformed.outcomes.every((outcome) => outcome.status === 'invalid')).toBe(true);
  });
  it('routes a purchase to every provider except GA4 with providers', async () => {
    autoLoadScripts();
    const clarity: SignalEvent[] = [];
    const sdk = createBrowserSignals({
      consent: both,
      autoTrack: false,
      providers: [
        createGA4Provider({ measurementId: 'G-TEST123' }),
        createMetaPixelProvider({ pixelId: '123456' }),
        {
          name: 'clarity',
          category: 'analytics',
          eventFamily: 'clarity',
          send: (event) => {
            clarity.push(event);
          },
        },
      ],
    });
    disposals.push(sdk.dispose);
    const result = await sdk.track(purchase, { providers: ['meta-pixel', 'clarity'] });
    expect(result.outcomes).toEqual([
      { provider: 'ga4', status: 'skipped', reason: 'not_targeted' },
      { provider: 'meta-pixel', status: 'sent' },
      { provider: 'clarity', status: 'sent' },
    ]);
    expect(ga4Events()).toHaveLength(0);
    expect(clarity).toHaveLength(1);
    // Page context is still set when only providers are given.
    expect(clarity[0]!.context?.page?.location).toBe(`${location.origin}/`);
    const combined = await sdk.page('/virtual', undefined, {
      categories: ['analytics'],
      providers: ['meta-pixel', 'clarity'],
    });
    expect(combined.outcomes.map((outcome) => outcome.status)).toEqual([
      'skipped',
      'skipped',
      'sent',
    ]);
    for (const options of [{ providers: 'clarity' }, { providers: [''] }, { providers: [1] }]) {
      const malformed = await sdk.track(purchase, options as never);
      expect(malformed.outcomes.every((outcome) => outcome.status === 'invalid')).toBe(true);
    }
    expect(clarity).toHaveLength(2);
  });
  it('never forwards caller consent or context', async () => {
    const events: SignalEvent[] = [];
    const sdk = createBrowserSignals({
      consent: denied,
      autoTrack: false,
      providers: [
        {
          name: 'recorder',
          category: 'analytics',
          eventFamily: 'ga4',
          send: (event) => {
            events.push(event);
          },
        },
      ],
    });
    disposals.push(sdk.dispose);
    const options = {
      consent: both,
      context: { page: { location: 'https://evil.example/x' }, ga4: { clientId: '1.2' } },
    } as never;
    const blocked = await sdk.track(purchase, options);
    expect(blocked.outcomes[0]).toMatchObject({ status: 'denied' });
    sdk.setConsent(analytics);
    await sdk.track(purchase, options);
    expect(events[0]!.context?.page?.location?.startsWith(location.origin)).toBe(true);
    expect(events[0]!.context?.ga4).toBeUndefined();
  });
});

describe('provider preload (O4/R10, fixture evidence)', () => {
  function create(consent: typeof denied, preloadProviders?: boolean, autoTrack = false) {
    const ga4 = createGA4Provider({ measurementId: 'G-TEST123' });
    const pixel = createMetaPixelProvider({ pixelId: '123456' });
    const ga4Prepare = vi.spyOn(ga4, 'prepare');
    const pixelPrepare = vi.spyOn(pixel, 'prepare');
    const sdk = createBrowserSignals({
      consent,
      autoTrack,
      preloadProviders,
      providers: [ga4, pixel],
    });
    disposals.push(sdk.dispose);
    return { sdk, ga4Prepare, pixelPrepare };
  }
  it('is off by default: nothing loads until the first event', async () => {
    const appended = autoLoadScripts();
    const { sdk, ga4Prepare } = create(denied);
    sdk.setConsent(analytics);
    expect(ga4Prepare).not.toHaveBeenCalled();
    expect(appended).toHaveLength(0);
    sdk.dispose();
  });
  it('prepares only newly granted categories while running and never while denied', async () => {
    const appended = autoLoadScripts();
    const { sdk, ga4Prepare, pixelPrepare } = create(denied, true);
    sdk.setConsent(analytics);
    expect(ga4Prepare).not.toHaveBeenCalled(); // not started yet
    sdk.setConsent(denied);
    sdk.start();
    await sdk.flush();
    expect(appended).toHaveLength(0);
    sdk.setConsent(analytics);
    await Promise.resolve();
    expect(ga4Prepare).toHaveBeenCalledOnce();
    expect(pixelPrepare).not.toHaveBeenCalled();
    expect(appended).toEqual([expect.stringContaining('googletagmanager.com')]);
    expect(ga4Events()).toEqual([]);
    sdk.setConsent(both);
    expect(ga4Prepare).toHaveBeenCalledOnce();
    expect(pixelPrepare).toHaveBeenCalledOnce();
  });
  it('prepares granted categories at start()', () => {
    autoLoadScripts();
    const { sdk, ga4Prepare, pixelPrepare } = create(analytics, true);
    sdk.start();
    expect(ga4Prepare).toHaveBeenCalledOnce();
    expect(pixelPrepare).not.toHaveBeenCalled();
  });
});
