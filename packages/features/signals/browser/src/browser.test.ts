import { exampleEvents } from '../../contracts/test/consumer-events.js';
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSignals } from './index.js';
import { createGA4Provider, createMetaPixelProvider, createClarityProvider } from './providers.js';
import type { SignalEvent } from '@techinject/contracts';
const consent = { analytics: true, marketing: true, observability: true };
const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  document.head.innerHTML = '';
  const globals = window as unknown as Record<string, unknown>;
  for (const key of ['dataLayer', 'gtag', 'fbq', 'clarity']) delete globals[key];
});
describe('browser lifecycle', () => {
  it('flush waits for observer records and invokes its flush hook', async () => {
    window.fetch = vi.fn(async () => new Response('ok'));
    let finish!: () => void;
    const flush = vi.fn(async () => {});
    const sdk = createBrowserSignals({
      consent,
      observer: {
        record: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
        flush,
      },
    });
    disposals.push(sdk.dispose);
    await window.fetch('/api');
    let done = false;
    const pending = sdk.flush().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(flush).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(flush).toHaveBeenCalledOnce();
  });
  it('bounds hung observer records and flush hooks', async () => {
    window.fetch = vi.fn(async () => new Response('ok'));
    const sdk = createBrowserSignals({
      consent,
      timeoutMs: 5,
      observer: {
        record: () => new Promise<void>(() => {}),
        flush: () => new Promise<void>(() => {}),
      },
    });
    disposals.push(sdk.dispose);
    await window.fetch('/api');
    await sdk.flush();
  });
  it('silently drops observer records at capacity without a fake event diagnostic', async () => {
    window.fetch = vi.fn(async () => new Response('ok'));
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const record = vi.fn(() => waiting);
    const onDiagnostic = vi.fn();
    const sdk = createBrowserSignals({
      consent,
      autoTrack: false,
      observer: { record },
      onDiagnostic,
    });
    disposals.push(sdk.dispose);
    sdk.start();
    await sdk.flush();
    onDiagnostic.mockClear();
    for (let index = 0; index < 33; index++) await window.fetch(`/api/${index}`);
    expect(record).toHaveBeenCalledTimes(32);
    expect(onDiagnostic).not.toHaveBeenCalled();
    release();
    await sdk.flush();
  });
  it('tracks initial and distinct navigation once, handles dynamic IDs and restores history', async () => {
    const events: unknown[] = [];
    const original = history.pushState;
    const sdk = createBrowserSignals({
      consent,
      providers: [
        {
          name: 'recorder',
          category: 'analytics',
          send: (event) => {
            events.push(event);
          },
        },
      ],
    });
    disposals.push(sdk.dispose);
    history.pushState(null, '', '/products/1?email=private');
    history.replaceState(null, '', '/products/1?x=2');
    history.pushState(null, '', '/products/2');
    await sdk.flush();
    expect(events).toHaveLength(3);
    expect(JSON.stringify(events)).not.toContain('private');
    sdk.stop();
    expect(history.pushState).toBe(original);
  });
  it('ignores query-only navigation even with a legacy trackQuery property', async () => {
    const pages: string[] = [];
    const legacyConfig = {
      consent,
      trackQuery: true,
      providers: [
        {
          name: 'recorder',
          category: 'analytics' as const,
          send(event: { name: string; properties: Record<string, unknown> }) {
            if (event.name === 'page_view') pages.push(event.properties.page_path as string);
          },
        },
      ],
    };
    const sdk = createBrowserSignals(legacyConfig);
    disposals.push(sdk.dispose);
    history.pushState(null, '', '/products/1?ref=first');
    history.replaceState(null, '', '/products/1?ref=second');
    await sdk.flush();
    expect(pages).toEqual(['/', '/products/:id']);
  });
  it('does not load or replay pages without consent and prevents duplicate active instrumentation', async () => {
    const send = vi.fn();
    const first = createBrowserSignals({
      providers: [{ name: 'recorder', category: 'analytics', send }],
    });
    disposals.push(first.dispose);
    const second = createBrowserSignals({
      consent,
      providers: [{ name: 'recorder', category: 'analytics', send }],
    });
    disposals.push(second.dispose);
    // A legacy caller cannot bypass the single-instance guard at runtime.
    Reflect.apply(second.start, second, [{ force: true }]);
    first.setConsent(consent);
    await first.flush();
    expect(send).not.toHaveBeenCalled();
    first.stop();
    second.start();
    await second.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('records failed fetches, propagates only allowed origins and preserves host headers and errors', async () => {
    const calls: { input: unknown; init?: RequestInit }[] = [];
    window.fetch = vi.fn(async (input, init) => {
      calls.push({ input, init });
      if (String(input).includes('fail')) throw new Error('host failure');
      return new Response('ok', { status: 201 });
    });
    const record = vi.fn();
    const sdk = createBrowserSignals({
      consent,
      observer: { record },
      traceOrigins: [location.origin],
      autoTrack: true,
    });
    disposals.push(sdk.dispose);
    await window.fetch('/api/items/123?secret=value');
    await window.fetch('https://external.test/api');
    await window.fetch('/existing', {
      headers: { traceparent: '00-existing-host-trace', authorization: 'host' },
    });
    await expect(window.fetch('/fail')).rejects.toThrow('host failure');
    expect(new Headers(calls[0]?.init?.headers).get('traceparent')).toMatch(
      /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/,
    );
    expect(new Headers(calls[1]?.init?.headers).has('traceparent')).toBe(false);
    expect(new Headers(calls[2]?.init?.headers).get('traceparent')).toBe('00-existing-host-trace');
    expect(record).toHaveBeenCalledTimes(4);
    expect(record.mock.calls[3]?.[0]).toMatchObject({ error: true, status: 0 });
    expect(JSON.stringify(record.mock.calls)).not.toContain('secret');
  });
  it('captures XHR completion and restores prototype patches', () => {
    const proto = window.XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;
    const headers: string[][] = [];
    vi.spyOn(proto, 'open').mockImplementation(() => {});
    vi.spyOn(proto, 'send').mockImplementation(function (this: XMLHttpRequest) {
      Object.defineProperty(this, 'status', { value: 503 });
      this.dispatchEvent(new Event('loadend'));
    });
    vi.spyOn(proto, 'setRequestHeader').mockImplementation((name, value) => {
      headers.push([name, value]);
    });
    const openBefore = proto.open;
    const record = vi.fn();
    const sdk = createBrowserSignals({
      consent,
      observer: { record },
      traceOrigins: [location.origin],
    });
    disposals.push(sdk.dispose);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/123?secret=value');
    xhr.send('private body');
    expect(headers[0]?.[0]).toBe('traceparent');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/:id', method: 'POST', status: 503, error: true }),
    );
    sdk.stop();
    expect(proto.open).toBe(openBefore);
    expect(originalOpen).not.toBe(openBefore);
    expect(originalSend).not.toBe(proto.send);
  });
  it('caps hung observers and excludes telemetry endpoints', async () => {
    window.fetch = vi.fn(async () => new Response('ok'));
    const record = vi.fn(() => new Promise<void>(() => {}));
    const sdk = createBrowserSignals({
      consent,
      observer: { record },
      excludeUrls: ['/telemetry'],
    });
    disposals.push(sdk.dispose);
    await window.fetch('/telemetry');
    for (let index = 0; index < 40; index++) await window.fetch('/api');
    expect(record).toHaveBeenCalledTimes(32);
  });
});
describe('browser providers', () => {
  it('dispatches one cart event to GA4, Meta Pixel and Clarity with the same SDK event ID', async () => {
    const observed: { provider: string; name: string; eventId: string }[] = [];
    const providers = [
      createGA4Provider({ measurementId: 'G-TRIPLE' }),
      createMetaPixelProvider({ pixelId: '123' }),
      createClarityProvider({ projectId: 'demo123' }),
    ].map((provider) => ({
      ...provider,
      async send(event: SignalEvent, signal?: AbortSignal) {
        observed.push({ provider: provider.name, name: event.name, eventId: event.eventId });
        await provider.send(event, signal);
      },
    }));
    const sdk = createBrowserSignals({
      autoTrack: false,
      consent,
      providers,
      events: exampleEvents,
    });
    disposals.push(sdk.dispose);
    const dispatch = sdk.track({
      name: 'add_to_cart',
      eventId: 'cart-shared-123',
      properties: {
        currency: 'INR',
        value: 450,
        items: [{ item_id: 'notebook', price: 450, quantity: 1 }],
      },
    });
    await Promise.resolve();
    const scripts = [...document.querySelectorAll('script')];
    expect(scripts).toHaveLength(3);
    scripts.forEach((script) => script.dispatchEvent(new Event('load')));
    expect((await dispatch).outcomes).toEqual([
      { provider: 'ga4', status: 'sent' },
      { provider: 'meta-pixel', status: 'sent' },
      { provider: 'clarity', status: 'sent' },
    ]);
    expect(observed).toHaveLength(3);
    expect(observed.map(({ eventId }) => eventId)).toEqual(Array(3).fill('cart-shared-123'));

    const globals = window as unknown as {
      dataLayer: unknown[][];
      fbq: { queue: unknown[][] };
      clarity: { q: unknown[][] };
    };
    const ga4Call = globals.dataLayer.findLast((args) => args[0] === 'event');
    expect(ga4Call?.[1]).toBe('add_to_cart');
    expect(ga4Call?.[2]).toMatchObject({ event_id: 'cart-shared-123' });
    const metaCall = globals.fbq.queue.findLast((args) => args[0] === 'trackSingle');
    expect(metaCall?.slice(0, 3)).toEqual(['trackSingle', '123', 'AddToCart']);
    expect(metaCall?.[4]).toEqual({ eventID: 'cart-shared-123' });
    expect(globals.clarity.q.findLast((args) => args[0] === 'event')).toEqual([
      'event',
      'add_to_cart',
    ]);

    await sdk.track({
      name: 'custom_event',
      eventId: 'custom-shared-123',
      properties: { action: 'video_play', label: 'intro', value: 0 },
    });
    expect(globals.dataLayer.findLast((args) => args[0] === 'event')?.[1]).toBe('video_play');
    const customGa4 = globals.dataLayer.findLast((args) => args[0] === 'event')?.[2];
    expect(customGa4).toMatchObject({ label: 'intro', value: 0, event_id: 'custom-shared-123' });
    expect(customGa4).not.toHaveProperty('action');
    expect(globals.fbq.queue.at(-1)?.slice(0, 3)).toEqual([
      'trackSingleCustom',
      '123',
      'video_play',
    ]);
    expect(globals.fbq.queue.at(-1)?.[3]).toMatchObject({ label: 'intro', value: 0 });
    expect(globals.fbq.queue.at(-1)?.[4]).toEqual({ eventID: 'custom-shared-123' });
    expect(globals.clarity.q.findLast((args) => args[0] === 'event')).toEqual([
      'event',
      'video_play',
    ]);
  });
  it('loads GA4 only after consent and sets explicit page dispatch', async () => {
    const provider = createGA4Provider({ measurementId: 'G-TEST' });
    const sdk = createBrowserSignals({ autoTrack: false, providers: [provider] });
    disposals.push(sdk.dispose);
    await sdk.page('/');
    expect(document.querySelector('script')).toBeNull();
    sdk.setConsent(consent);
    const dispatch = sdk.page('/');
    await Promise.resolve();
    const script = document.querySelector('script');
    expect(script?.src).toContain('googletagmanager.com');
    script?.dispatchEvent(new Event('load'));
    await dispatch;
    const layer = (window as unknown as { dataLayer: unknown[][] }).dataLayer;
    expect(
      layer.some(
        (args) =>
          args[0] === 'config' && (args[2] as { send_page_view: boolean }).send_page_view === false,
      ),
    ).toBe(true);
    sdk.setConsent({ ...consent, analytics: false });
    expect(layer.at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
  });
  it('initializes optional Clarity after consent and revokes its storage category', async () => {
    const sdk = createBrowserSignals({
      autoTrack: false,
      consent,
      providers: [createClarityProvider({ projectId: 'test123' })],
    });
    disposals.push(sdk.dispose);
    const result = sdk.page('/');
    await Promise.resolve();
    document.querySelector('script')?.dispatchEvent(new Event('load'));
    await result;
    sdk.setConsent({ ...consent, analytics: false });
    const clarity = (window as unknown as { clarity: { q: unknown[][] } }).clarity;
    expect(clarity.q.at(-1)).toEqual([
      'consentv2',
      { analytics_Storage: 'denied', ad_Storage: 'denied' },
    ]);
  });
  it('maps purchase event ID for Meta deduplication and reports blocked scripts', async () => {
    const provider = createMetaPixelProvider({ pixelId: '123' });
    const sdk = createBrowserSignals({
      autoTrack: false,
      consent,
      providers: [provider],
      events: exampleEvents,
    });
    disposals.push(sdk.dispose);
    const dispatch = sdk.track({
      name: 'purchase',
      eventId: 'purchase-123',
      properties: {
        transaction_id: 'order-1',
        currency: 'INR',
        value: 10,
        items: [{ item_id: 'sku-1', price: 10, quantity: 1 }],
      },
    });
    await Promise.resolve();
    document.querySelector('script')?.dispatchEvent(new Event('load'));
    await dispatch;
    const queue = (window as unknown as { fbq: { queue: unknown[][] } }).fbq.queue;
    expect(queue.at(-1)?.slice(0, 3)).toEqual(['trackSingle', '123', 'Purchase']);
    expect(queue.at(-1)?.[4]).toEqual({ eventID: 'purchase-123' });

    await sdk.track({
      name: 'login',
      eventId: 'login-123',
      properties: { method: 'password' },
    });
    expect(queue.at(-1)?.slice(0, 3)).toEqual(['trackSingleCustom', '123', 'Login']);
    expect(queue.at(-1)?.[4]).toEqual({ eventID: 'login-123' });

    await sdk.track({
      name: 'custom_event',
      eventId: 'custom-123',
      properties: { action: 'video_play' },
    });
    expect(queue.at(-1)?.slice(0, 3)).toEqual(['trackSingleCustom', '123', 'video_play']);
    expect(queue.at(-1)?.[4]).toEqual({ eventID: 'custom-123' });
    const blocked = createBrowserSignals({
      autoTrack: false,
      consent,
      providers: [createGA4Provider({ measurementId: 'G-BLOCKED' })],
    });
    disposals.push(blocked.dispose);
    const result = blocked.page('/blocked');
    await Promise.resolve();
    expect((await result).outcomes[0]?.status).toBe('failed');
  });
  it('excludes query parameters from GA4 page_location', async () => {
    history.replaceState(
      null,
      '',
      '/products/shoes?utm_source=google&utm_extra=%2B919876543210&gclid=gclid123&secret=token',
    );
    const sdk = createBrowserSignals({
      autoTrack: false,
      consent,
      providers: [createGA4Provider({ measurementId: 'G-UTM123' })],
    });
    disposals.push(sdk.dispose);
    const result = sdk.track({
      name: 'page_view',
      eventId: 'pv-utm',
      properties: { page_path: '/products/shoes' },
    });
    await Promise.resolve();
    document.querySelector('script')?.dispatchEvent(new Event('load'));
    await result;
    const layer = (window as unknown as { dataLayer: unknown[][] }).dataLayer;
    const eventCall = layer.findLast(
      (args) => args[0] === 'event' && (args[2] as Record<string, unknown>)?.event_id === 'pv-utm',
    );
    expect(eventCall).toBeDefined();
    const eventParams = eventCall![2] as Record<string, string>;
    expect(new URL(eventParams.page_location).pathname).toBe('/products/shoes');
    expect(new URL(eventParams.page_location).search).toBe('');
  });
  it('ignores in-page anchors without hash route tracking', async () => {
    history.replaceState(null, '', '/product/x');
    const pages: string[] = [];
    const sdk = createBrowserSignals({
      consent,
      providers: [
        {
          name: 'recorder',
          category: 'analytics',
          send: (event) => {
            pages.push(event.properties.page_path as string);
          },
        },
      ],
    });
    disposals.push(sdk.dispose);
    await sdk.flush();
    expect(pages).toEqual(['/product/x']);

    window.location.hash = '#reviews';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    history.pushState(null, '', '/product/x#details');
    await sdk.flush();
    expect(pages).toEqual(['/product/x']);

    window.location.hash = '#/catalog';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await sdk.flush();
    expect(pages).toEqual(['/product/x']);
  });
  it('tracks hash routes only when enabled and ignores plain anchors', async () => {
    history.replaceState(null, '', '/product/x');
    const pages: string[] = [];
    const sdk = createBrowserSignals({
      consent,
      trackHash: true,
      providers: [
        {
          name: 'recorder',
          category: 'analytics',
          send: (event) => {
            pages.push(event.properties.page_path as string);
          },
        },
      ],
    });
    disposals.push(sdk.dispose);
    await sdk.flush();
    expect(pages).toEqual(['/product/x']);

    window.location.hash = '#reviews';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await sdk.flush();
    expect(pages).toEqual(['/product/x']);

    window.location.hash = '#/catalog';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await sdk.flush();
    expect(pages).toEqual(['/product/x', '/catalog']);

    window.location.hash = '#!/catalog?tab=reviews';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await sdk.flush();
    expect(pages).toEqual(['/product/x', '/catalog']);

    window.location.hash = '#reviews';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await sdk.flush();
    expect(pages).toEqual(['/product/x', '/catalog']);
  });
  it('does not turn browser errors into request records', async () => {
    const records: RequestRecord[] = [];
    window.fetch = vi.fn(async () => new Response('failed', { status: 500 }));
    const sdk = createBrowserSignals({
      consent,
      observer: {
        record: (rec) => {
          records.push(rec);
        },
      },
    });
    disposals.push(sdk.dispose);
    window.dispatchEvent(new ErrorEvent('error', { message: 'synthetic crash' }));
    window.dispatchEvent(new Event('unhandledrejection'));
    await sdk.flush();
    expect(records).toEqual([]);

    await window.fetch('/api/failure');
    await sdk.flush();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'request', method: 'GET', status: 500, error: true });
  });
});
