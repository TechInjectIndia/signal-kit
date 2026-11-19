import type { EventDefinition, RegisteredEventInput, SignalsOptions } from '@techinject/core';
import {
  createSignals,
  generateId,
  metaClickCookie,
  safePageLocation,
  safeReferrer,
  safeRoute,
  parseTraceparent,
} from '@techinject/core';
import type {
  Consent,
  DispatchResult,
  EventContext,
  Observer,
  Provider,
  RequestRecord,
  TrackOptions,
} from '@techinject/contracts';
import { createAttributionStore, type AttributionOptions } from './attribution.js';
import { claimOwner, releaseOwner } from './owner.js';
export { auditAttribution } from './audit.js';
export type { AttributionFinding, AttributionAuditOptions } from './audit.js';
export { createGA4Provider, createMetaPixelProvider, createClarityProvider } from './providers.js';
export type { AttributionOptions, AttributionStorage, Attribution } from './attribution.js';
export type { AttributionTouch, AttributionChannel, ClickIdName } from '@techinject/core';
export {
  parseAttribution,
  safePageLocation,
  safeReferrer,
  metaClickCookie,
  classifyReferrerHost,
  TRACKING_PARAMETERS,
} from '@techinject/core';
export type { ReferrerClass, UserIdentity, CustomerType } from '@techinject/core';
type Category = keyof Consent;
/**
 * Browser per-call options. Only provider targeting is accepted: consent and transport context
 * stay SDK-owned in the browser (per-call consent is a server feature).
 */
export type BrowserTrackOptions = {
  categories?: readonly Category[];
  /** Deliver only to providers whose `name` is listed; others report `skipped`/`not_targeted`. */
  providers?: readonly string[];
};
type Targeting = { categories?: readonly Category[]; providers?: readonly string[] };
export type PageOnConsentOptions = {
  /**
   * Attach the landing URL's allowlisted campaign/click parameters to the first consent-time
   * page_view that targets analytics, when the current URL carries none. Off by default.
   */
  landingParams?: boolean;
};
/** Vendor-owned anonymous identifiers for the host to pass to its server-side events. */
export type ProviderIds = {
  ga4?: { clientId?: string; sessionId?: string };
  meta?: { fbp?: string; fbc?: string };
};
export type ProviderIdsOptions = {
  /** Upper bound for slow vendor lookups; default 500 ms, clamped to 50–2000. */
  timeoutMs?: number;
};
const PAGE_CATEGORIES = ['analytics', 'marketing'] as const;
const CATEGORIES: readonly Category[] = ['analytics', 'marketing', 'observability'];
const ID_PATTERNS = {
  ga4: { clientId: /^\d+\.\d+$/, sessionId: /^\d+$/ },
  meta: {
    fbp: /^fb\.\d+\.\d+\.[A-Za-z0-9_-]+$/,
    fbc: /^fb\.\d+\.\d+\.[A-Za-z0-9_-]+$/,
  },
} as const;
function pickIds(value: unknown, patterns: Record<string, RegExp>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, pattern] of Object.entries(patterns)) {
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry === 'string' && pattern.test(entry)) out[key] = entry;
  }
  return out;
}
function httpLocation(value: string): string | undefined {
  return value.length <= 2048 && /^https?:\/\//.test(value) ? value : undefined;
}
export type BrowserConfig<Events extends readonly EventDefinition[] = readonly []> =
  SignalsOptions<Events> & {
    observer?: Observer;
    traceOrigins?: string[];
    excludeUrls?: string[];
    autoTrack?: boolean;
    trackHash?: boolean;
    /** Capture the landing visit source (UTM, ad click IDs, search/social referrers). Off by default. */
    attribution?: boolean | AttributionOptions;
    /**
     * Send one fresh page_view for the current route when analytics or marketing flips from
     * denied to granted while running, routed only to the newly granted categories. Earlier
     * denied page views are never replayed. Off by default; hosts that enable it must remove
     * their own post-consent page() call.
     */
    pageOnConsent?: boolean | PageOnConsentOptions;
    /**
     * Call provider.prepare() (script preload, no data) at start() for granted categories and
     * whenever a category flips to granted. Off by default: scripts otherwise load on first send.
     */
    preloadProviders?: boolean;
  };
export function createBrowserSignals<const Events extends readonly EventDefinition[] = readonly []>(
  config: BrowserConfig<Events> = {},
) {
  const core = createSignals(config);
  const providers: readonly Provider[] = [...(config.providers ?? [])];
  const pageOnConsent =
    config.pageOnConsent === true ||
    (!!config.pageOnConsent && typeof config.pageOnConsent === 'object');
  const landingParams =
    typeof config.pageOnConsent === 'object' && config.pageOnConsent?.landingParams === true;
  let disposed = false;
  const attributionOptions = config.attribution === true ? {} : config.attribution || undefined;
  const attribution = attributionOptions ? createAttributionStore(attributionOptions) : undefined;
  const attributionCategory = attributionOptions
    ? (attributionOptions.category ?? 'marketing')
    : undefined;
  let running = false;
  const owner = {};
  const pendingRecords = new Set<Promise<void>>();
  const observationTimeout = Number.isFinite(config.timeoutMs)
    ? Math.max(1, Math.min(30000, config.timeoutMs!))
    : 2000;
  async function boundedObservation(deliver: () => Promise<void> | void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve(deliver()),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, observationTimeout);
        }),
      ]);
    } catch {
      /* Observer failures cannot affect the host. */
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  let lastRoute = '';
  let lastPathname = '';
  const restores: (() => void)[] = [];
  const isHashRoute = (hash: string) =>
    config.trackHash === true && (hash.startsWith('#/') || hash.startsWith('#!/'));
  const excluded = (url: URL) =>
    [
      'googletagmanager.com',
      'google-analytics.com',
      'facebook.net',
      'facebook.com',
      'clarity.ms',
    ].some((host) => url.hostname === host || url.hostname.endsWith('.' + host)) ||
    (config.excludeUrls ?? []).some(
      (value) => url.href.startsWith(value) || url.pathname.startsWith(value),
    );
  const currentRoute = () => {
    if (typeof location === 'undefined') return '/';
    if (isHashRoute(location.hash)) {
      const hashRoute =
        location.hash.slice(location.hash.startsWith('#!') ? 2 : 1).split('#')[0] ?? '/';
      const queryIndex = hashRoute.indexOf('?');
      return queryIndex < 0 ? hashRoute : hashRoute.slice(0, queryIndex);
    }
    return location.pathname;
  };
  /** Location path behind GA4 page_location: hash routes keep their base path. */
  const derivedPath = () => {
    if (typeof location === 'undefined') return '/';
    return isHashRoute(location.hash)
      ? location.pathname.replace(/\/+$/, '') + currentRoute()
      : location.pathname;
  };
  /** Sanitised page context for a route, or undefined during SSR or on a non-http(s) page. */
  const pageContext = (explicit?: string, landing = false): EventContext['page'] => {
    if (typeof location === 'undefined') return undefined;
    try {
      let value = safePageLocation(
        `${location.origin}${safeRoute(explicit || derivedPath())}${location.search}`,
      );
      if (landing && landingHref && !value.includes('?')) {
        const query = safePageLocation(landingHref).split('?')[1];
        if (query) value += `?${query}`;
      }
      const page: NonNullable<EventContext['page']> = {};
      const safeLocation = httpLocation(value);
      if (safeLocation) page.location = safeLocation;
      const referrer = typeof document === 'undefined' ? '' : safeReferrer(document.referrer);
      if (referrer && httpLocation(referrer)) page.referrer = referrer;
      return page.location || page.referrer ? page : undefined;
    } catch {
      return undefined;
    }
  };
  // The last page view's location is reused while the URL is unchanged, so later events keep
  // an explicit page(path) route rather than the raw URL.
  let lastPage: { href: string; explicit?: string; page: EventContext['page'] } | undefined;
  const currentPage = () =>
    typeof location !== 'undefined' && lastPage?.href === location.href ? lastPage : undefined;
  const currentKey = () => currentPage()?.explicit || derivedPath();
  // Route of the last page_view dispatched while each category was granted (R3).
  const pagedRoute: Partial<Record<(typeof PAGE_CATEGORIES)[number], string>> = {};
  let landingHref: string | undefined;
  let landingParamsUsed = false;
  /**
   * Records the route for each granted page category this page_view reaches. A category whose
   * page providers were all excluded by name is not recorded, so its consent-time page view
   * still fires later.
   */
  const notePage = (key: string, targets?: Targeting) => {
    const consent = core.getConsent();
    for (const category of PAGE_CATEGORIES)
      if (
        consent[category] &&
        (!targets?.categories || targets.categories.includes(category)) &&
        (!targets?.providers ||
          providers.some(
            (provider) =>
              provider.category === category &&
              provider.eventFamily &&
              targets.providers!.includes(provider.name),
          ))
      )
        pagedRoute[category] = key;
  };
  /**
   * Reads untrusted browser options; only `categories` and `providers` survive. `null` marks
   * them malformed (core then reports `track_options`).
   */
  const readTargets = (options: unknown): Targeting | null | undefined => {
    if (options === undefined) return undefined;
    try {
      if (options === null || typeof options !== 'object') return null;
      const categories: unknown = (options as BrowserTrackOptions).categories;
      const names: unknown = (options as BrowserTrackOptions).providers;
      if (
        categories !== undefined &&
        !(
          Array.isArray(categories) &&
          categories.every((entry) => CATEGORIES.includes(entry as Category))
        )
      )
        return null;
      if (
        names !== undefined &&
        !(
          Array.isArray(names) &&
          names.length <= 20 &&
          names.every(
            (entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 64,
          )
        )
      )
        return null;
      return {
        ...(categories !== undefined ? { categories: [...(categories as Category[])] } : {}),
        ...(names !== undefined ? { providers: [...(names as string[])] } : {}),
      };
    } catch {
      return null;
    }
  };
  const forward = (
    targets: Targeting | null | undefined,
    page: EventContext['page'],
  ): TrackOptions =>
    // A malformed value is forwarded as an invalid shape so core reports `track_options`.
    targets === null
      ? ({ categories: null } as unknown as TrackOptions)
      : { ...targets, ...(page ? { context: { page } } : {}) };
  const pageView = (
    explicit: string | undefined,
    eventId?: string,
    targets?: Targeting | null,
    landing = false,
  ) => {
    const page = pageContext(explicit);
    if (typeof location !== 'undefined')
      lastPage = { href: location.href, ...(explicit ? { explicit } : {}), page };
    if (targets !== null) notePage(explicit || derivedPath(), targets);
    return core.track(
      {
        name: 'page_view',
        ...(eventId ? { eventId } : {}),
        properties: {
          page_path: safeRoute(explicit || currentRoute()),
        },
      },
      forward(targets, landing ? pageContext(explicit, true) : page),
    );
  };
  const page = (path?: string, eventId?: string, options?: BrowserTrackOptions) =>
    pageView(path || undefined, eventId, readTargets(options));
  /**
   * Browser track: forwards only `categories` and `providers`, and always sets `context.page` from the tracked
   * route, so hosts cannot widen consent or inject transport context per call.
   */
  const track = (
    input: RegisteredEventInput<Events>,
    options?: BrowserTrackOptions,
  ): Promise<DispatchResult> => {
    const targets = readTargets(options);
    let name: unknown;
    try {
      name = (input as { name?: unknown } | undefined)?.name;
    } catch {
      /* Invalid input stays private; core reports it. */
    }
    if (name === 'page_view' && targets !== null) notePage(currentKey(), targets);
    const current = currentPage();
    return core.track(input, forward(targets, current ? current.page : pageContext()));
  };
  /** R3: one new page_view for the newly granted page categories; nothing is replayed. */
  const pageAfterConsent = (previous: Consent, next: Consent) => {
    if (!pageOnConsent || !running || disposed) return;
    const key = currentKey();
    const targets = PAGE_CATEGORIES.filter(
      (category) =>
        !previous[category] &&
        next[category] &&
        pagedRoute[category] !== key &&
        providers.some((provider) => provider.category === category && provider.eventFamily),
    );
    if (!targets.length) return;
    const landing = landingParams && !landingParamsUsed && targets.includes('analytics');
    if (landing) landingParamsUsed = true;
    void pageView(currentPage()?.explicit, undefined, { categories: targets }, landing);
  };
  /** R10: vendor script preload only; prepare() never sends data. */
  const preload = (categories: readonly Category[]) => {
    if (config.preloadProviders !== true || !running || disposed) return;
    const consent = core.getConsent();
    for (const provider of providers) {
      if (!provider.prepare || !consent[provider.category]) continue;
      if (!categories.includes(provider.category)) continue;
      try {
        void Promise.resolve(provider.prepare()).catch(() => undefined);
      } catch {
        /* Host isolation. */
      }
    }
  };
  /**
   * GA4 and Meta browser identifiers for server-side events. Only providers whose category is
   * granted are asked, values are validated per family and never logged or retained.
   */
  async function getProviderIds(options?: ProviderIdsOptions): Promise<ProviderIds> {
    if (disposed || typeof window === 'undefined') return {};
    let timeoutMs = 500;
    try {
      const requested = options?.timeoutMs;
      if (typeof requested === 'number' && Number.isFinite(requested))
        timeoutMs = Math.max(50, Math.min(2000, requested));
    } catch {
      /* Malformed options use the default. */
    }
    const consent = core.getConsent();
    const eligible = providers.filter(
      (provider) =>
        provider.identifiers &&
        (provider.eventFamily === 'ga4' || provider.eventFamily === 'meta') &&
        consent[provider.category],
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<undefined>((resolve) => {
      timer = setTimeout(resolve, timeoutMs, undefined);
    });
    const answers = await Promise.all(
      eligible.map(async (provider) => {
        try {
          const value = await Promise.race([
            Promise.resolve().then(() => provider.identifiers!()),
            deadline,
          ]);
          return { provider, value };
        } catch {
          return { provider, value: undefined };
        }
      }),
    );
    if (timer !== undefined) clearTimeout(timer);
    if (disposed) return {};
    // Consent may have been withdrawn while vendors were answering.
    const now = core.getConsent();
    const ids: ProviderIds = {};
    for (const { provider, value } of answers) {
      if (!now[provider.category]) continue;
      const family = provider.eventFamily as 'ga4' | 'meta';
      const picked = pickIds(value, ID_PATTERNS[family]);
      if (Object.keys(picked).length) ids[family] = { ...picked, ...ids[family] };
    }
    if (
      now.marketing &&
      !ids.meta?.fbc &&
      attribution &&
      attributionCategory &&
      now[attributionCategory]
    ) {
      const touches = attribution.get();
      const touch = touches.last?.clickIds?.fbclid ? touches.last : touches.first;
      const fbclid = touch?.clickIds?.fbclid;
      const fbc = fbclid ? metaClickCookie(fbclid, touch!.timestamp) : undefined;
      if (fbc && ID_PATTERNS.meta.fbc.test(fbc)) ids.meta = { ...ids.meta, fbc };
    }
    return ids;
  }
  const record = (value: RequestRecord) => {
    if (!core.getConsent().observability || !running) return;
    if (!config.observer) return;
    if (pendingRecords.size >= 32) return;
    const operation = boundedObservation(() => config.observer!.record(value)).finally(() => {
      pendingRecords.delete(operation);
    });
    pendingRecords.add(operation);
  };
  const navigation = () => {
    if (!running || typeof location === 'undefined') return;
    if (location.hash && !isHashRoute(location.hash) && location.pathname === lastPathname) return;
    lastPathname = location.pathname;
    const current = currentRoute();
    if (current === lastRoute) return;
    lastRoute = current;
    void pageView(undefined);
  };
  function start() {
    if (running || typeof window === 'undefined' || !claimOwner(owner)) return;
    running = true;
    // The landing URL is read before any router strips its parameters.
    landingHref ??= location.href;
    attribution?.capture(location.href, document.referrer);
    preload(CATEGORIES);
    navigation();
    for (const name of ['pushState', 'replaceState'] as const) {
      const original = history[name];
      const wrapped: typeof original = function (this: History, ...args) {
        original.apply(this, args);
        navigation();
      };
      history[name] = wrapped;
      restores.push(() => {
        if (history[name] === wrapped) history[name] = original;
      });
    }
    window.addEventListener('popstate', navigation);
    restores.push(() => window.removeEventListener('popstate', navigation));
    if (config.trackHash === true) {
      window.addEventListener('hashchange', navigation);
      restores.push(() => window.removeEventListener('hashchange', navigation));
    }
    const originalFetch = window.fetch;
    if (originalFetch) {
      const wrapped: typeof fetch = async (input, init) => {
        if (!running) return originalFetch.call(window, input, init);
        const raw = input instanceof Request ? input.url : String(input);
        let url: URL;
        try {
          url = new URL(raw, location.href);
        } catch {
          return originalFetch.call(window, input, init);
        }
        if (excluded(url) || !core.getConsent().observability)
          return originalFetch.call(window, input, init);
        const startTime = performance.now();
        const method = (
          init?.method ?? (input instanceof Request ? input.method : 'GET')
        ).toUpperCase();
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        const existing = parseTraceparent(headers.get('traceparent'));
        let traceId: string | undefined = existing?.traceId;
        let spanId: string | undefined = existing?.spanId;
        if ((config.traceOrigins ?? []).includes(url.origin) && !headers.has('traceparent')) {
          traceId = generateId().replaceAll('-', '').slice(0, 32);
          spanId = generateId().replaceAll('-', '').slice(0, 16);
          headers.set('traceparent', `00-${traceId}-${spanId}-01`);
        }
        const context = { ...(traceId ? { traceId } : {}), ...(spanId ? { spanId } : {}) };
        try {
          const response = await originalFetch.call(window, input, { ...init, headers });
          record({
            kind: 'request',
            route: safeRoute(url.href),
            method,
            status: response.status,
            durationMs: performance.now() - startTime,
            error: response.status >= 400,
            ...context,
          });
          return response;
        } catch (error) {
          record({
            kind: 'request',
            route: safeRoute(url.href),
            method,
            status: 0,
            durationMs: performance.now() - startTime,
            error: true,
            ...context,
          });
          throw error;
        }
      };
      window.fetch = wrapped;
      restores.push(() => {
        if (window.fetch === wrapped) window.fetch = originalFetch;
      });
    }
    const proto = window.XMLHttpRequest?.prototype;
    if (proto) {
      const originalOpen = proto.open;
      const originalSend = proto.send;
      const originalHeader = proto.setRequestHeader;
      const state = new WeakMap<
        XMLHttpRequest,
        { url: URL; method: string; trace: boolean; traceparent?: string }
      >();
      const open = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        async: boolean = true,
        username?: string | null,
        password?: string | null,
      ) {
        try {
          state.set(this, {
            url: new URL(String(url), location.href),
            method: method.toUpperCase(),
            trace: false,
          });
        } catch {
          state.delete(this);
        }
        return originalOpen.call(this, method, url, async, username, password);
      } as typeof proto.open;
      const setHeader = function (this: XMLHttpRequest, name: string, value: string) {
        const entry = state.get(this);
        if (entry && name.toLowerCase() === 'traceparent') {
          entry.trace = true;
          entry.traceparent = value;
        }
        originalHeader.call(this, name, value);
      };
      const send = function (
        this: XMLHttpRequest,
        body?: Document | XMLHttpRequestBodyInit | null,
      ) {
        const entry = state.get(this);
        if (!running) return originalSend.call(this, body);
        if (!entry || excluded(entry.url) || !core.getConsent().observability)
          return originalSend.call(this, body);
        const startTime = performance.now();
        const existing = parseTraceparent(entry.traceparent);
        let traceId: string | undefined = existing?.traceId;
        let spanId: string | undefined = existing?.spanId;
        if ((config.traceOrigins ?? []).includes(entry.url.origin) && !entry.trace) {
          traceId = generateId().replaceAll('-', '').slice(0, 32);
          spanId = generateId().replaceAll('-', '').slice(0, 16);
          originalHeader.call(this, 'traceparent', `00-${traceId}-${spanId}-01`);
        }
        const complete = () =>
          record({
            kind: 'request',
            route: safeRoute(entry.url.href),
            method: entry.method,
            status: this.status,
            durationMs: performance.now() - startTime,
            error: this.status === 0 || this.status >= 400,
            ...(traceId ? { traceId } : {}),
            ...(spanId ? { spanId } : {}),
          });
        this.addEventListener('loadend', complete, { once: true });
        try {
          return originalSend.call(this, body);
        } catch (error) {
          this.removeEventListener('loadend', complete);
          throw error;
        }
      };
      proto.open = open;
      proto.send = send;
      proto.setRequestHeader = setHeader;
      restores.push(() => {
        if (proto.open === open) proto.open = originalOpen;
        if (proto.send === send) proto.send = originalSend;
        if (proto.setRequestHeader === setHeader) proto.setRequestHeader = originalHeader;
      });
    }
  }
  function stop() {
    releaseOwner(owner);
    running = false;
    restores
      .splice(0)
      .reverse()
      .forEach((restore) => restore());
  }
  const dispose = () => {
    disposed = true;
    stop();
    try {
      config.observer?.setConsent?.({ analytics: false, marketing: false, observability: false });
    } catch {}
    core.dispose();
    try {
      config.observer?.dispose?.();
    } catch {}
  };
  const setConsent = (consent: Consent) => {
    const previous = core.getConsent();
    core.setConsent(consent);
    const next = core.getConsent();
    attribution?.setConsent(next);
    try {
      config.observer?.setConsent?.(next);
    } catch {}
    const granted = CATEGORIES.filter((category) => !previous[category] && next[category]);
    if (!granted.length) return;
    preload(granted);
    pageAfterConsent(previous, next);
  };
  attribution?.setConsent(core.getConsent());
  try {
    config.observer?.setConsent?.(core.getConsent());
  } catch {}
  const api = {
    ...core,
    async flush() {
      await core.flush();
      await Promise.all([...pendingRecords]);
      if (config.observer?.flush) await boundedObservation(() => config.observer!.flush!());
    },
    track,
    setConsent,
    page,
    getProviderIds,
    start,
    stop,
    dispose,
    /**
     * First/last visit source for the host to store with its own order; empty when not enabled
     * or while the attribution category is denied.
     */
    getAttribution: () => attribution?.get() ?? {},
    clearAttribution: () => attribution?.clear(),
    /** Whether a visit source was captured, regardless of consent; boolean only, for audits. */
    isAttributionCaptured: () => {
      if (!attribution) return false;
      const stored = attribution.get();
      return attribution.hasLanding() || !!(stored.first || stored.last);
    },
    /** True when `attribution` was configured; used by auditAttribution. */
    isAttributionEnabled: () => attribution !== undefined,
    /** Consent category that permits persisting the touch; undefined when capture is off. */
    getAttributionCategory: () => attributionCategory,
  };
  if (config.autoTrack !== false) start();
  return api;
}
export type BrowserSignals<Events extends readonly EventDefinition[] = readonly []> = ReturnType<
  typeof createBrowserSignals<Events>
>;

export { defineEvent } from '@techinject/core';
export type { EventDefinition, RegisteredEventInput } from '@techinject/core';
