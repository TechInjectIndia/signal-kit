// @vitest-environment jsdom
/**
 * Command-level adapter tests against jsdom stand-ins for gtag.js, fbevents.js and Clarity.
 * These are fixture evidence of the commands the adapters queue; they are not live GA4
 * DebugView, Meta Test Events or Clarity verification.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSignals } from './index.js';
import { createClarityProvider, createGA4Provider, createMetaPixelProvider } from './providers.js';
import type { Consent, SignalEvent } from '@techinject/contracts';

const granted: Consent = { analytics: true, marketing: true, observability: true };
const denied: Consent = { analytics: false, marketing: false, observability: false };
type Globals = {
  dataLayer?: ArrayLike<unknown>[];
  gtag?: (...args: unknown[]) => void;
  fbq?: { queue: unknown[][] };
  clarity?: { q: unknown[][] };
};
const globals = () => window as unknown as Globals;
const commands = () => (globals().dataLayer ?? []).map((entry) => Array.from(entry));
const disposals: (() => void)[] = [];
const cookies: string[] = [];
function setCookie(name: string, value: string) {
  cookies.push(name);
  document.cookie = `${name}=${value}; path=/`;
}
function pageView(eventId: string, context?: SignalEvent['context']): SignalEvent {
  return {
    name: 'page_view',
    eventId,
    timestamp: Date.now(),
    properties: { page_path: '/' },
    ...(context ? { context } : {}),
  };
}
async function loadScripts() {
  await Promise.resolve();
  document.querySelectorAll('script').forEach((script) => script.dispatchEvent(new Event('load')));
}
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  document.head.innerHTML = '';
  for (const name of cookies.splice(0))
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  const raw = window as unknown as Record<string, unknown>;
  for (const key of ['dataLayer', 'gtag', 'fbq', 'clarity']) delete raw[key];
});

describe('GA4 gtag stub (G1, fixture evidence)', () => {
  it('pushes Arguments objects to dataLayer exactly like the Google snippet', async () => {
    const provider = createGA4Provider({ measurementId: 'G-ARGS' });
    provider.setConsent(granted);
    const sent = provider.send(pageView('pv-args'));
    await loadScripts();
    await sent;
    const layer = globals().dataLayer!;
    expect(layer.length).toBeGreaterThan(0);
    for (const entry of layer)
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]');
    expect(commands().map((entry) => entry[0])).toEqual([
      'consent',
      'consent',
      'js',
      'config',
      'event',
    ]);
  });
  it('respects a host-defined window.gtag', async () => {
    const host = vi.fn();
    globals().gtag = host;
    const provider = createGA4Provider({ measurementId: 'G-HOST' });
    provider.setConsent(granted);
    const sent = provider.send(pageView('pv-host'));
    await loadScripts();
    await sent;
    expect(globals().gtag).toBe(host);
    expect(host.mock.calls.map((call) => call[0])).toEqual([
      'consent',
      'consent',
      'js',
      'config',
      'event',
    ]);
  });
});

describe('GA4 page context', () => {
  it('uses the sanitised context page location and referrer when supplied', async () => {
    history.replaceState(null, '', '/actual?utm_source=ignored');
    const provider = createGA4Provider({ measurementId: 'G-CONTEXT' });
    provider.setConsent(granted);
    const sent = provider.send(
      pageView('pv-context', {
        page: {
          location: `${location.origin}/app/products?gclid=abc&secret=token`,
          referrer: 'https://search.example/path?q=private',
        },
      }),
    );
    await loadScripts();
    await sent;
    const config = commands().find((entry) => entry[0] === 'config')?.[2];
    const params = commands().find((entry) => entry[0] === 'event')?.[2] as Record<string, string>;
    expect(params.page_location).toBe(`${location.origin}/app/products?gclid=abc`);
    expect(params.page_referrer).toBe('https://search.example/');
    expect(config).toMatchObject({ page_location: `${location.origin}/app/products?gclid=abc` });
  });
  it('falls back to the current location without context', async () => {
    history.replaceState(null, '', '/actual?utm_source=news&secret=token');
    const provider = createGA4Provider({ measurementId: 'G-NOCONTEXT' });
    provider.setConsent(granted);
    const sent = provider.send(pageView('pv-plain'));
    await loadScripts();
    await sent;
    const params = commands().find((entry) => entry[0] === 'event')?.[2] as Record<string, string>;
    expect(params.page_location).toBe(`${location.origin}/actual?utm_source=news`);
    expect(params.page_referrer).toBe('');
  });
});

describe('provider prepare()', () => {
  it('GA4 appends the vendor script once and queues no event', async () => {
    const provider = createGA4Provider({ measurementId: 'G-PREPARE' });
    provider.setConsent(granted);
    const first = provider.prepare!();
    await loadScripts();
    await first;
    await provider.prepare!();
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(commands().some((entry) => entry[0] === 'event')).toBe(false);
    expect(commands().find((entry) => entry[0] === 'config')?.[2]).toMatchObject({
      send_page_view: false,
    });
  });
  it('does nothing while the category is denied and swallows a blocked script', async () => {
    const ga4 = createGA4Provider({ measurementId: 'G-PREPDENIED' });
    ga4.setConsent(denied);
    await ga4.prepare!();
    expect(document.querySelector('script')).toBeNull();
    expect(globals().dataLayer).toBeUndefined();
    ga4.setConsent(granted);
    const blocked = ga4.prepare!();
    await Promise.resolve();
    document.querySelector('script')?.dispatchEvent(new Event('error'));
    await expect(blocked).resolves.toBeUndefined();
  });
  it('Meta Pixel grants consent before loading and tracks nothing', async () => {
    const provider = createMetaPixelProvider({ pixelId: '123' });
    provider.setConsent(granted);
    const prepared = provider.prepare!();
    expect(document.querySelectorAll('script')).toHaveLength(1);
    const queue = globals().fbq!.queue;
    expect(queue.map((entry) => entry[0])).toEqual(['set', 'init', 'consent']);
    expect(queue.at(-1)).toEqual(['consent', 'grant']);
    await loadScripts();
    await prepared;
    expect(queue.some((entry) => String(entry[0]).startsWith('track'))).toBe(false);
  });
  it('Clarity initialises its queue and loads without sending an event', async () => {
    const provider = createClarityProvider({ projectId: 'prep123' });
    provider.setConsent(granted);
    const prepared = provider.prepare!();
    await loadScripts();
    await prepared;
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(globals().clarity!.q).toEqual([
      ['consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' }],
    ]);
  });
});

describe('GA4 setUser', () => {
  it('sets user_id after init and clears it with null', async () => {
    const provider = createGA4Provider({ measurementId: 'G-USER' });
    provider.setConsent(granted);
    const sent = provider.send(pageView('pv-user'));
    await loadScripts();
    await sent;
    provider.setUser!({ id: 'user-42', customerType: 'registered' });
    expect(commands().slice(-2)).toEqual([
      ['set', { user_id: 'user-42' }],
      ['set', 'user_properties', { customer_type: 'registered' }],
    ]);
    const length = commands().length;
    provider.setUser!({ id: 'user-42', customerType: 'registered' });
    expect(commands()).toHaveLength(length);
    provider.setUser!(undefined);
    expect(commands().slice(-2)).toEqual([
      ['set', { user_id: null }],
      ['set', 'user_properties', { customer_type: null }],
    ]);
  });
  it('includes identity known before init in config, never in event params', async () => {
    const provider = createGA4Provider({ measurementId: 'G-PREUSER' });
    provider.setConsent(granted);
    provider.setUser!({ id: 'user-7', customerType: 'guest' });
    expect(globals().dataLayer).toBeUndefined();
    const sent = provider.send(pageView('pv-preuser'));
    await loadScripts();
    await sent;
    expect(commands().find((entry) => entry[0] === 'config')?.[2]).toMatchObject({
      user_id: 'user-7',
      user_properties: { customer_type: 'guest' },
    });
    expect(commands().some((entry) => entry[0] === 'set')).toBe(false);
    const params = commands().find((entry) => entry[0] === 'event')?.[2];
    expect(JSON.stringify(params)).not.toContain('user-7');
  });
  it('is consent-gated through the SDK: denied analytics never reaches gtag', async () => {
    const sdk = createBrowserSignals({
      autoTrack: false,
      consent: { ...granted, analytics: false },
      providers: [createGA4Provider({ measurementId: 'G-GATED' })],
    });
    disposals.push(sdk.dispose);
    sdk.setUser({ id: 'user-9' });
    sdk.setConsent(granted);
    sdk.setConsent({ ...granted, analytics: false });
    sdk.setConsent(granted);
    const sent = sdk.page('/gated');
    await loadScripts();
    await sent;
    expect(commands().find((entry) => entry[0] === 'config')?.[2]).toMatchObject({
      user_id: 'user-9',
    });
    sdk.setConsent({ ...granted, analytics: false });
    expect(commands().at(-2)).toEqual(['set', { user_id: null }]);
  });
});

describe('Clarity setUser', () => {
  it('identifies after init and again on each page_view only', async () => {
    const provider = createClarityProvider({ projectId: 'ident123' });
    provider.setConsent(granted);
    provider.setUser!({ id: 'user-42' });
    expect(globals().clarity).toBeUndefined();
    const first = provider.send(pageView('pv-1'));
    await loadScripts();
    await first;
    const q = globals().clarity!.q;
    const identifies = () => q.filter((entry) => entry[0] === 'identify');
    expect(identifies()).toEqual([['identify', 'user-42']]);
    await provider.send({
      name: 'login',
      eventId: 'login-1',
      timestamp: Date.now(),
      properties: { method: 'password' },
    });
    expect(identifies()).toHaveLength(1);
    await provider.send(pageView('pv-2'));
    expect(identifies()).toHaveLength(2);
    provider.setUser!({ id: 'user-43' });
    expect(q.at(-1)).toEqual(['identify', 'user-43']);
    provider.setUser!(undefined);
    await provider.send(pageView('pv-3'));
    expect(identifies()).toHaveLength(3);
  });
  it('ignores identity while analytics is denied', async () => {
    const provider = createClarityProvider({ projectId: 'deny123' });
    provider.setConsent(denied);
    provider.setUser!({ id: 'user-42' });
    provider.setConsent(granted);
    const sent = provider.send(pageView('pv-denied'));
    await loadScripts();
    await sent;
    expect(globals().clarity!.q.some((entry) => entry[0] === 'identify')).toBe(false);
  });
});

describe('Meta Pixel identity (O5: unsupported)', () => {
  it('has no setUser and never passes identity to fbq', async () => {
    const provider = createMetaPixelProvider({ pixelId: '123' });
    expect(provider.setUser).toBeUndefined();
    const sdk = createBrowserSignals({ autoTrack: false, consent: granted, providers: [provider] });
    disposals.push(sdk.dispose);
    sdk.setUser({ id: 'user-42' });
    const sent = sdk.page('/meta');
    await loadScripts();
    await sent;
    const init = globals().fbq!.queue.find((entry) => entry[0] === 'init');
    expect(init).toEqual(['init', '123']);
    expect(JSON.stringify(globals().fbq!.queue)).not.toContain('user-42');
  });
});

describe('identity never in event payloads', () => {
  it('keeps the user key out of every provider event command', async () => {
    const sdk = createBrowserSignals({
      autoTrack: false,
      consent: granted,
      providers: [
        createGA4Provider({ measurementId: 'G-PAYLOAD' }),
        createMetaPixelProvider({ pixelId: '123' }),
        createClarityProvider({ projectId: 'payload123' }),
      ],
    });
    disposals.push(sdk.dispose);
    sdk.setUser({ id: 'user-secret-key', customerType: 'registered' });
    const sent = sdk.page('/payload');
    await loadScripts();
    await sent;
    await sdk.track({ name: 'login', properties: { method: 'password' } });
    const events = [
      ...commands().filter((entry) => entry[0] === 'event'),
      ...globals().fbq!.queue.filter((entry) => String(entry[0]).startsWith('track')),
      ...globals().clarity!.q.filter((entry) => entry[0] === 'event'),
    ];
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(events)).not.toContain('user-secret-key');
  });
});

describe('provider identifiers()', () => {
  it('GA4 resolves client_id and session_id from gtag get', async () => {
    globals().dataLayer = [];
    globals().gtag = function (...args: unknown[]) {
      if (args[0] === 'get')
        (args[3] as (value: unknown) => void)(args[2] === 'client_id' ? '111.222' : 1700000000);
    };
    const provider = createGA4Provider({ measurementId: 'G-IDS' });
    provider.setConsent(granted);
    const sent = provider.send(pageView('pv-ids'));
    await loadScripts();
    await sent;
    expect(await provider.identifiers!()).toEqual({ clientId: '111.222', sessionId: '1700000000' });
  });
  it('GA4 falls back to cookies when gtag get never answers', async () => {
    vi.useFakeTimers();
    setCookie('_ga', 'GA1.1.333.444');
    setCookie('_ga_FALLBACK', 'GS2.1.s1700000001$o1$g0$t1700000002$j60$l0$h0');
    const provider = createGA4Provider({ measurementId: 'G-FALLBACK' });
    provider.setConsent(granted);
    const sent = provider.send(pageView('pv-fallback'));
    await loadScripts();
    await sent;
    const ids = provider.identifiers!();
    await vi.advanceTimersByTimeAsync(400);
    expect(await ids).toEqual({ clientId: '333.444', sessionId: '1700000001' });
  });
  it('GA4 reads GS1 cookies without initialising gtag and rejects malformed values', async () => {
    setCookie('_ga', 'GA1.1.555.666');
    setCookie('_ga_OLD', 'GS1.1.1700000003.1.1.1700000004.0.0.0');
    const provider = createGA4Provider({ measurementId: 'G-OLD' });
    provider.setConsent(granted);
    expect(await provider.identifiers!()).toEqual({ clientId: '555.666', sessionId: '1700000003' });
    expect(globals().dataLayer).toBeUndefined();
    setCookie('_ga', 'GA1.1.me@example.test.1');
    setCookie('_ga_OLD', 'GS1.1.abc.1');
    expect(await provider.identifiers!()).toEqual({});
  });
  it('GA4 returns nothing while analytics is denied', async () => {
    setCookie('_ga', 'GA1.1.777.888');
    const provider = createGA4Provider({ measurementId: 'G-DENIEDIDS' });
    provider.setConsent(denied);
    expect(await provider.identifiers!()).toEqual({});
  });
  it('Meta validates _fbp/_fbc and is gated by marketing consent', async () => {
    setCookie('_fbp', 'fb.1.1700000000000.123456789');
    setCookie('_fbc', 'fb.1.1700000000000.AbC_-1');
    const provider = createMetaPixelProvider({ pixelId: '123' });
    provider.setConsent(denied);
    expect(await provider.identifiers!()).toEqual({});
    provider.setConsent(granted);
    expect(await provider.identifiers!()).toEqual({
      fbp: 'fb.1.1700000000000.123456789',
      fbc: 'fb.1.1700000000000.AbC_-1',
    });
    setCookie('_fbc', 'fb.1.x.<script>');
    expect(await provider.identifiers!()).toEqual({ fbp: 'fb.1.1700000000000.123456789' });
    expect(globals().fbq).toBeUndefined();
  });
});
