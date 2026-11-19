// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSignals, type BrowserConfig } from './index.js';
import { createGA4Provider, createMetaPixelProvider } from './providers.js';
import type { DispatchResult } from '@techinject/contracts';

const denied = { analytics: false, marketing: false, observability: false };
const analytics = { ...denied, analytics: true };
const marketing = { ...denied, marketing: true };
const both = { analytics: true, marketing: true, observability: false };

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
  document.head.innerHTML = '';
  const globals = window as unknown as Record<string, unknown>;
  for (const key of ['dataLayer', 'gtag', 'fbq', 'clarity']) delete globals[key];
});

/** Vendor scripts "load" immediately and are never really appended. */
function autoLoadScripts() {
  vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
    queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')));
    return node;
  });
}
/** GA4 `event page_view` commands, read from the gtag Arguments entries. */
function ga4PageViews(): Record<string, string>[] {
  const layer = (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [];
  return layer
    .map((entry) => Array.from(entry))
    .filter((args) => args[0] === 'event' && args[1] === 'page_view')
    .map((args) => args[2] as Record<string, string>);
}
function pixelPageViews(): unknown[][] {
  const queue = (window as unknown as { fbq?: { queue: unknown[][] } }).fbq?.queue ?? [];
  return queue.filter((args) => args[0] === 'trackSingle' && args[2] === 'PageView');
}
function setup(extra: Partial<BrowserConfig> = {}) {
  autoLoadScripts();
  const results: DispatchResult[] = [];
  const sdk = createBrowserSignals({
    consent: denied,
    pageOnConsent: true,
    providers: [
      createGA4Provider({ measurementId: 'G-TEST123' }),
      createMetaPixelProvider({ pixelId: '123456' }),
    ],
    onDiagnostic: (result) => results.push(result),
    ...extra,
  });
  disposals.push(sdk.dispose);
  return { sdk, results };
}

describe('consent-time page view (R3, runtime evidence in jsdom with fixture providers)', () => {
  it('grants analytics then marketing without duplicating GA4 or replaying the denied view', async () => {
    const { sdk, results } = setup();
    await sdk.flush();
    expect(results).toHaveLength(1);
    expect(results[0]!.outcomes.map((outcome) => outcome.status)).toEqual(['denied', 'denied']);
    const deniedId = results[0]!.eventId;

    sdk.setConsent(analytics);
    await sdk.flush();
    expect(ga4PageViews()).toHaveLength(1);
    expect(pixelPageViews()).toHaveLength(0);
    expect(results[1]!.eventId).not.toBe(deniedId);
    expect(results[1]!.outcomes).toEqual([
      { provider: 'ga4', status: 'sent' },
      { provider: 'meta-pixel', status: 'skipped', reason: 'not_targeted' },
    ]);

    sdk.setConsent(both);
    await sdk.flush();
    expect(ga4PageViews()).toHaveLength(1);
    expect(pixelPageViews()).toHaveLength(1);
    expect(results[2]!.outcomes).toEqual([
      { provider: 'ga4', status: 'skipped', reason: 'not_targeted' },
      { provider: 'meta-pixel', status: 'sent' },
    ]);

    // Re-sending the same consent, or withdrawing and re-granting on the same route, adds nothing.
    sdk.setConsent(both);
    sdk.setConsent(denied);
    sdk.setConsent(both);
    await sdk.flush();
    expect(ga4PageViews()).toHaveLength(1);
    expect(pixelPageViews()).toHaveLength(1);
    expect(new Set(results.map((result) => result.eventId)).size).toBe(results.length);
  });
  it('grants marketing then analytics with one view per vendor', async () => {
    const { sdk } = setup();
    sdk.setConsent(marketing);
    await sdk.flush();
    expect(pixelPageViews()).toHaveLength(1);
    expect(ga4PageViews()).toHaveLength(0);
    sdk.setConsent(both);
    await sdk.flush();
    expect(pixelPageViews()).toHaveLength(1);
    expect(ga4PageViews()).toHaveLength(1);
  });
  it('sends one shared event when both categories are granted together', async () => {
    const { sdk, results } = setup();
    sdk.setConsent(both);
    await sdk.flush();
    expect(ga4PageViews()).toHaveLength(1);
    expect(pixelPageViews()).toHaveLength(1);
    expect(results.at(-1)!.outcomes.map((outcome) => outcome.status)).toEqual(['sent', 'sent']);
  });
  it('sends one view for the new route after navigation while consent was withdrawn', async () => {
    const { sdk } = setup();
    sdk.setConsent(analytics);
    await sdk.flush();
    sdk.setConsent(denied);
    history.pushState(null, '', '/b');
    await sdk.flush();
    expect(ga4PageViews()).toHaveLength(1);
    sdk.setConsent(analytics);
    await sdk.flush();
    const views = ga4PageViews();
    expect(views).toHaveLength(2);
    expect(new URL(views[1]!.page_location!).pathname).toBe('/b');
  });
  it('emits nothing when the option is unset or before start()', async () => {
    const off = setup({ pageOnConsent: undefined });
    off.sdk.setConsent(both);
    await off.sdk.flush();
    expect(ga4PageViews()).toHaveLength(0);
    expect(pixelPageViews()).toHaveLength(0);
    off.sdk.dispose();

    const idle = setup({ autoTrack: false });
    idle.sdk.setConsent(both);
    await idle.sdk.flush();
    expect(idle.results).toHaveLength(0);
    idle.sdk.start();
    await idle.sdk.flush();
    // start() sends the ordinary initial view under the consent already granted.
    expect(ga4PageViews()).toHaveLength(1);
    expect(pixelPageViews()).toHaveLength(1);
  });
  it('keeps the consent-time view for a category whose providers were excluded by name', async () => {
    const { sdk } = setup({ consent: both });
    await sdk.flush();
    expect(ga4PageViews()).toHaveLength(1);
    expect(pixelPageViews()).toHaveLength(1);
    // GA4 never receives this view, so analytics has not seen /virtual.
    await sdk.page('/virtual', undefined, { providers: ['meta-pixel'] });
    expect(ga4PageViews()).toHaveLength(1);
    expect(pixelPageViews()).toHaveLength(2);
    sdk.setConsent(marketing);
    sdk.setConsent(both);
    await sdk.flush();
    const views = ga4PageViews();
    expect(views).toHaveLength(2);
    expect(new URL(views[1]!.page_location!).pathname).toBe('/virtual');
    expect(pixelPageViews()).toHaveLength(2);
    // A view that did reach GA4 by name is recorded: no duplicate on re-grant.
    await sdk.page('/named', undefined, { providers: ['ga4'] });
    sdk.setConsent(marketing);
    sdk.setConsent(both);
    await sdk.flush();
    expect(ga4PageViews()).toHaveLength(3);
  });
  it('ignores categories without a page-consuming provider', async () => {
    autoLoadScripts();
    const send = vi.fn();
    const sdk = createBrowserSignals({
      pageOnConsent: true,
      providers: [{ name: 'recorder', category: 'analytics', send }],
    });
    disposals.push(sdk.dispose);
    sdk.setConsent(both);
    await sdk.flush();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('consent-time landing parameters (O8, fixture evidence)', () => {
  it('adds landing click parameters once when landingParams is on', async () => {
    history.replaceState(null, '', '/?gclid=test');
    const { sdk } = setup({ pageOnConsent: { landingParams: true } });
    history.pushState(null, '', '/b');
    sdk.setConsent(analytics);
    await sdk.flush();
    const consentView = new URL(ga4PageViews()[0]!.page_location!);
    expect(consentView.pathname).toBe('/b');
    expect(consentView.searchParams.get('gclid')).toBe('test');
    history.pushState(null, '', '/c');
    await sdk.flush();
    const next = new URL(ga4PageViews()[1]!.page_location!);
    expect(next.pathname).toBe('/c');
    expect(next.searchParams.has('gclid')).toBe(false);
  });
  it('keeps landing parameters off by default', async () => {
    history.replaceState(null, '', '/?gclid=test');
    const { sdk } = setup();
    history.pushState(null, '', '/b');
    sdk.setConsent(analytics);
    await sdk.flush();
    const consentView = new URL(ga4PageViews()[0]!.page_location!);
    expect(consentView.pathname).toBe('/b');
    expect(consentView.search).toBe('');
  });
});
