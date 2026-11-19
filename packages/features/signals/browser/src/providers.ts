import { safePageLocation, safeReferrer } from '@techinject/core';
import { getProviderEvent } from '@techinject/contracts';
import type { Consent, Provider, SignalEvent, UserIdentity } from '@techinject/contracts';
type ConsentProvider = Provider & { setConsent(consent: Consent): void };
type Identifiers = Readonly<Record<string, string>>;
type ScriptConfig = { nonce?: string; timeoutMs?: number };
type Globals = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: Pixel;
  clarity?: (...args: unknown[]) => void;
};
type Pixel = ((...args: unknown[]) => void) & {
  queue?: unknown[][];
  callMethod?: (...args: unknown[]) => void;
  loaded?: boolean;
  version?: string;
  push?: Pixel;
};
const win = () => window as Globals;
function loader(src: string, config: ScriptConfig) {
  let pending: Promise<void> | undefined;
  let script: HTMLScriptElement | undefined;
  return {
    load(signal?: AbortSignal) {
      if (pending) return pending;
      pending = new Promise<void>((resolve, reject) => {
        if (typeof document === 'undefined')
          return reject(new Error('Browser provider requires a document'));
        script = document.createElement('script');
        script.async = true;
        script.src = src;
        if (config.nonce) script.nonce = config.nonce;
        const timer = setTimeout(
          () => done(new Error('Provider script timed out')),
          config.timeoutMs ?? 4000,
        );
        const abort = () => done(new Error('Provider script aborted'));
        function done(error?: Error) {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          if (script) {
            script.onload = null;
            script.onerror = null;
          }
          if (error) {
            script?.remove();
            pending = undefined;
            reject(error);
          } else resolve();
        }
        script.onload = () => done();
        script.onerror = () => done(new Error('Provider script blocked'));
        if (signal?.aborted) return abort();
        signal?.addEventListener('abort', abort, { once: true });
        document.head.appendChild(script);
      });
      return pending;
    },
    dispose() {
      script?.remove();
      script = undefined;
      pending = undefined;
    },
  };
}
function id(value: string, pattern: RegExp, label: string) {
  if (!pattern.test(value)) throw new Error(`Invalid ${label}`);
}
const DENIED = { analytics: false, marketing: false } as const;
const hasDocument = () => typeof document !== 'undefined';
/** First-party cookie value by exact name; undefined when absent, undecodable or without a DOM. */
function cookie(name: string): string | undefined {
  if (!hasDocument()) return undefined;
  for (const part of document.cookie.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
/** Keeps only entries that match their pattern; vendor values are never trusted as-is. */
function valid(entries: Record<string, string | undefined>, patterns: Record<string, RegExp>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries))
    if (typeof value === 'string' && patterns[key]?.test(value)) out[key] = value;
  return out as Identifiers;
}
const GA4_IDS = { clientId: /^\d+\.\d+$/, sessionId: /^\d+$/ };
const META_COOKIE = /^fb\.\d+\.\d+\.[A-Za-z0-9_-]+$/;
export function createGA4Provider(
  config: ScriptConfig & { measurementId: string; googleAdsConsent?: 'denied' | 'marketing' },
): ConsentProvider {
  id(config.measurementId, /^G-[A-Z0-9]+$/, 'GA4 measurement ID');
  const script = loader(
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.measurementId)}`,
    config,
  );
  let initialized = false;
  // Bumped on dispose so an in-flight send is dropped, while the adapter stays reusable by a
  // later SDK instance (hosts commonly build providers once at module scope).
  let generation = 0;
  let currentConsent: { analytics: boolean; marketing: boolean } = DENIED;
  // shortcut: one active browser SDK owns window.gtag consent per window; dispose may deny
  // global fields and a second live adapter would not re-assert its grants. Revisit if more
  // than one live SDK instance per window becomes supported.
  let appliedConsent = { analytics: false, adFields: false };
  // Identity is held only while analytics is granted (core passes undefined otherwise) and is
  // sent as `set` / `config` fields, never as event parameters.
  let user: UserIdentity | undefined;
  let appliedUser: string | undefined;
  const userKey = (value: UserIdentity | undefined) =>
    value ? `${value.id}\u0000${value.customerType ?? ''}` : undefined;
  const applyUser = () => {
    const key = userKey(user);
    if (key === appliedUser) return;
    const gtag = win().gtag;
    gtag?.('set', { user_id: user?.id ?? null });
    gtag?.('set', 'user_properties', { customer_type: user?.customerType ?? null });
    appliedUser = key;
  };
  const updateConsent = () => {
    const adFields = config.googleAdsConsent === 'marketing' && currentConsent.marketing;
    if (
      currentConsent.analytics === appliedConsent.analytics &&
      adFields === appliedConsent.adFields
    )
      return;
    win().gtag?.(
      'consent',
      'update',
      config.googleAdsConsent === 'marketing'
        ? {
            analytics_storage: currentConsent.analytics ? 'granted' : 'denied',
            ad_storage: adFields ? 'granted' : 'denied',
            ad_user_data: adFields ? 'granted' : 'denied',
            ad_personalization: adFields ? 'granted' : 'denied',
          }
        : { analytics_storage: currentConsent.analytics ? 'granted' : 'denied' },
    );
    appliedConsent = { analytics: currentConsent.analytics, adFields };
  };
  const setup = (page?: { location?: string; referrer?: string }) => {
    const w = win();
    w.dataLayer ??= [];
    // Same shape as Google's snippet: gtag.js processes only `Arguments` objects, so pushing a
    // rest-parameter array would leave consent, config and event commands unprocessed.
    w.gtag ??= function () {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer?.push(arguments);
    };
    if (!initialized) {
      w.gtag('consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
      updateConsent();
      w.gtag('js', new Date());
      // Campaign/click parameters stay on page_location and the referrer keeps its host so GA4
      // can attribute paid, organic and referral sessions; everything else is redacted.
      w.gtag('config', config.measurementId, {
        send_page_view: false,
        ...pageFields(page),
        ...(user
          ? {
              user_id: user.id,
              ...(user.customerType
                ? { user_properties: { customer_type: user.customerType } }
                : {}),
            }
          : {}),
      });
      appliedUser = userKey(user);
      initialized = true;
    }
  };
  // Campaign/click parameters stay on page_location and the referrer keeps its host so GA4 can
  // attribute paid, organic and referral sessions; everything else is redacted. A context page
  // (hash route or explicit page path) is re-sanitised rather than trusted.
  const pageFields = (page?: { location?: string; referrer?: string }) => ({
    page_location: safePageLocation(page?.location ?? location.href),
    page_referrer: safeReferrer(page?.referrer ?? document.referrer),
  });
  const getField = (field: 'client_id' | 'session_id', timeoutMs: number) =>
    new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), timeoutMs);
      try {
        win().gtag?.('get', config.measurementId, field, (value: unknown) => {
          clearTimeout(timer);
          resolve(value === undefined || value === null ? undefined : String(value));
        });
      } catch {
        clearTimeout(timer);
        resolve(undefined);
      }
    });
  const cookieIds = () => {
    const ga = cookie('_ga')?.split('.');
    const stream = cookie(`_ga_${config.measurementId.slice(2)}`);
    let sessionId: string | undefined;
    if (stream?.startsWith('GS1.')) sessionId = stream.split('.')[2];
    else if (stream?.startsWith('GS2.')) sessionId = /^GS2\.\d+\.s(\d+)(?:\$|$)/.exec(stream)?.[1];
    return {
      clientId: ga && ga.length === 4 && ga[0] === 'GA1' ? `${ga[2]}.${ga[3]}` : undefined,
      sessionId,
    };
  };
  return {
    name: 'ga4',
    eventFamily: 'ga4',
    category: 'analytics',
    async send(event, signal) {
      const started = generation;
      const mapped = getProviderEvent(event, 'ga4');
      setup(event.context?.page);
      await script.load(signal);
      if (started !== generation || signal?.aborted) throw new Error('Dispatch aborted');
      win().gtag?.('event', mapped.name, {
        ...mapped.properties,
        ...pageFields(event.context?.page),
        event_id: event.eventId,
        send_to: config.measurementId,
      });
    },
    async prepare() {
      if (!hasDocument() || !currentConsent.analytics) return;
      setup();
      await script.load().catch(() => undefined);
    },
    setUser(next) {
      user = next && currentConsent.analytics ? { ...next } : undefined;
      if (initialized) applyUser();
    },
    async identifiers() {
      if (!hasDocument() || !currentConsent.analytics) return {};
      const timeoutMs = 400;
      const [clientId, sessionId] = initialized
        ? await Promise.all([getField('client_id', timeoutMs), getField('session_id', timeoutMs)])
        : [];
      // The caller may have withdrawn consent while gtag was answering.
      if (!currentConsent.analytics) return {};
      const fallback = cookieIds();
      return valid(
        {
          clientId: clientId && GA4_IDS.clientId.test(clientId) ? clientId : fallback.clientId,
          sessionId:
            sessionId && GA4_IDS.sessionId.test(sessionId) ? sessionId : fallback.sessionId,
        },
        GA4_IDS,
      );
    },
    setConsent(consent) {
      currentConsent = { analytics: consent.analytics, marketing: consent.marketing };
      if (initialized) updateConsent();
    },
    dispose() {
      generation++;
      currentConsent = DENIED;
      if (initialized) updateConsent();
      user = undefined;
      if (initialized) applyUser();
      script.dispose();
    },
  };
}
export function createMetaPixelProvider(
  config: ScriptConfig & { pixelId: string },
): ConsentProvider {
  id(config.pixelId, /^\d+$/, 'Meta pixel ID');
  const script = loader('https://connect.facebook.net/en_US/fbevents.js', config);
  let initialized = false;
  let marketing = false;
  const setup = () => {
    const w = win();
    if (!w.fbq) {
      const fbq: Pixel = (...args) => {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue?.push(args);
      };
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.push = fbq;
      w.fbq = fbq;
    }
    if (!initialized) {
      w.fbq('set', 'autoConfig', false, config.pixelId);
      w.fbq('init', config.pixelId);
      initialized = true;
    }
  };
  return {
    name: 'meta-pixel',
    eventFamily: 'meta',
    category: 'marketing',
    async send(event, signal) {
      const mapped = getProviderEvent(event, 'meta');
      setup();
      await script.load(signal);
      if (signal?.aborted) throw new Error('Dispatch aborted');
      win().fbq?.('consent', 'grant');
      const method = mapped.mode === 'standard' ? 'trackSingle' : 'trackSingleCustom';
      win().fbq?.(method, config.pixelId, mapped.name, mapped.properties, {
        eventID: event.eventId,
      });
    },
    // No setUser: Pixel advanced matching / external_id is deliberately unsupported (owner
    // decision O5); browser identity never reaches fbq.
    async prepare() {
      if (!hasDocument() || !marketing) return;
      setup();
      win().fbq?.('consent', 'grant');
      await script.load().catch(() => undefined);
    },
    identifiers() {
      if (!hasDocument() || !marketing) return {};
      return valid(
        { fbp: cookie('_fbp'), fbc: cookie('_fbc') },
        { fbp: META_COOKIE, fbc: META_COOKIE },
      );
    },
    setConsent(consent) {
      marketing = consent.marketing;
      if (initialized) win().fbq?.('consent', consent.marketing ? 'grant' : 'revoke');
    },
    dispose() {
      marketing = false;
      if (initialized) win().fbq?.('consent', 'revoke');
      script.dispose();
    },
  };
}
export function createClarityProvider(
  config: ScriptConfig & { projectId: string },
): ConsentProvider {
  id(config.projectId, /^[a-z0-9]+$/i, 'Clarity project ID');
  const script = loader(
    `https://www.clarity.ms/tag/${encodeURIComponent(config.projectId)}`,
    config,
  );
  let initialized = false;
  let analytics = false;
  let user: string | undefined;
  const init = () => {
    if (initialized) return;
    const w = win();
    if (!w.clarity) {
      const queue: unknown[][] = [];
      const clarity = (...args: unknown[]) => {
        queue.push(args);
      };
      Object.assign(clarity, { q: queue });
      w.clarity = clarity;
    }
    initialized = true;
  };
  const granted = () =>
    win().clarity?.('consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' });
  // Clarity hashes the custom ID client-side; the opaque host key is the only value passed.
  const identify = () => {
    if (user) win().clarity?.('identify', user);
  };
  return {
    name: 'clarity',
    eventFamily: 'clarity',
    category: 'analytics',
    async send(event, signal) {
      const mapped = getProviderEvent(event, 'clarity');
      const first = !initialized;
      init();
      await script.load(signal);
      if (signal?.aborted) throw new Error('Dispatch aborted');
      granted();
      if (first || event.name === 'page_view') identify();
      if (event.name !== 'page_view') win().clarity?.('event', mapped.name);
    },
    async prepare() {
      if (!hasDocument() || !analytics) return;
      const first = !initialized;
      init();
      granted();
      if (first) identify();
      await script.load().catch(() => undefined);
    },
    setUser(next) {
      const id = next && analytics ? next.id : undefined;
      const changed = id !== user;
      // Clarity has no un-identify; clearing stops further identify calls for this session.
      user = id;
      if (changed && initialized) identify();
    },
    setConsent(consent) {
      analytics = consent.analytics;
      if (initialized)
        win().clarity?.('consentv2', {
          analytics_Storage: consent.analytics ? 'granted' : 'denied',
          ad_Storage: 'denied',
        });
    },
    dispose() {
      analytics = false;
      user = undefined;
      if (initialized)
        win().clarity?.('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' });
      script.dispose();
    },
  };
}
