import { createSignals, generateId, safeRoute, parseTraceparent } from '@techinject/core';
import type { Consent, Observer, RequestRecord } from '@techinject/contracts';
export { createGA4Provider, createMetaPixelProvider, createClarityProvider } from './providers.js';
export type BrowserConfig = Parameters<typeof createSignals>[0] & {
  observer?: Observer;
  traceOrigins?: string[];
  excludeUrls?: string[];
  autoTrack?: boolean;
};
let activeOwner: object | undefined;
export function createBrowserSignals(config: BrowserConfig = {}) {
  const core = createSignals(config);
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
  let lastPath = '';
  const restores: (() => void)[] = [];
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
  const page = (path?: string, eventId?: string) =>
    core.track({
      name: 'page_view',
      ...(eventId ? { eventId } : {}),
      properties: {
        page_path: safeRoute(path ?? (typeof location === 'undefined' ? '/' : location.href)),
      },
    });
  const record = (value: RequestRecord) => {
    if (!core.getConsent().observability || !running) return;
    if (!config.observer || pendingRecords.size >= 32) return;
    const operation = boundedObservation(() => config.observer!.record(value)).finally(() => {
      pendingRecords.delete(operation);
    });
    pendingRecords.add(operation);
  };
  const navigation = () => {
    if (!running) return;
    const path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    void page();
  };
  function start() {
    if (running || typeof window === 'undefined' || activeOwner) return;
    activeOwner = owner;
    running = true;
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
    if (activeOwner === owner) activeOwner = undefined;
    running = false;
    restores
      .splice(0)
      .reverse()
      .forEach((restore) => restore());
  }
  const dispose = () => {
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
    core.setConsent(consent);
    try {
      config.observer?.setConsent?.(core.getConsent());
    } catch {}
  };
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
    setConsent,
    page,
    start,
    stop,
    dispose,
  };
  if (config.autoTrack !== false) start();
  return api;
}
export type BrowserSignals = ReturnType<typeof createBrowserSignals>;
