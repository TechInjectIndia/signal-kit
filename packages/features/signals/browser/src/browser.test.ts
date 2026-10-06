// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSignals } from './index.js';
import { createGA4Provider, createMetaPixelProvider, createClarityProvider } from './providers.js';
const consent = { analytics: true, marketing: true, observability: true };
const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  document.head.innerHTML = '';
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
    const sdk = createBrowserSignals({ autoTrack: false, consent, providers: [provider] });
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
    const blocked = createBrowserSignals({
      autoTrack: false,
      consent,
      providers: [createGA4Provider({ measurementId: 'G-BLOCKED' })],
    });
    disposals.push(blocked.dispose);
    const result = blocked.page('/blocked');
    await Promise.resolve();
    [...document.querySelectorAll('script')].at(-1)?.dispatchEvent(new Event('error'));
    expect((await result).outcomes[0]?.status).toBe('failed');
  });
});
