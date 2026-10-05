import { safeRoute } from '@signalkit/core';
import type { Consent, Provider, SignalEvent } from '@signalkit/contracts';
type ConsentProvider = Provider & { setConsent(consent: Consent): void };
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
export function createGA4Provider(
  config: ScriptConfig & { measurementId: string },
): ConsentProvider {
  id(config.measurementId, /^G-[A-Z0-9]+$/, 'GA4 measurement ID');
  const script = loader(
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.measurementId)}`,
    config,
  );
  let initialized = false;
  const setup = () => {
    const w = win();
    w.dataLayer ??= [];
    w.gtag ??= function (...args) {
      w.dataLayer?.push(args);
    };
    if (!initialized) {
      w.gtag('consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
      w.gtag('js', new Date());
      w.gtag('config', config.measurementId, {
        send_page_view: false,
        page_location: location.origin + safeRoute(location.href),
        page_referrer: document.referrer ? safeRoute(document.referrer) : '',
      });
      initialized = true;
    }
  };
  return {
    name: 'ga4',
    category: 'analytics',
    async send(event, signal) {
      setup();
      await script.load(signal);
      if (signal?.aborted) throw new Error('Dispatch aborted');
      win().gtag?.('consent', 'update', { analytics_storage: 'granted' });
      win().gtag?.('event', event.name === 'product_view' ? 'view_item' : event.name, {
        ...event.properties,
        page_location: location.origin + safeRoute(location.href),
        page_referrer: document.referrer ? safeRoute(document.referrer) : '',
        event_id: event.eventId,
        send_to: config.measurementId,
      });
    },
    setConsent(consent) {
      if (initialized)
        win().gtag?.('consent', 'update', {
          analytics_storage: consent.analytics ? 'granted' : 'denied',
        });
    },
    dispose() {
      if (initialized) win().gtag?.('consent', 'update', { analytics_storage: 'denied' });
      script.dispose();
    },
  };
}
const metaNames: Record<SignalEvent['name'], string> = {
  page_view: 'PageView',
  product_view: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
};
export function createMetaPixelProvider(
  config: ScriptConfig & { pixelId: string },
): ConsentProvider {
  id(config.pixelId, /^\d+$/, 'Meta pixel ID');
  const script = loader('https://connect.facebook.net/en_US/fbevents.js', config);
  let initialized = false;
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
    category: 'marketing',
    async send(event, signal) {
      setup();
      await script.load(signal);
      if (signal?.aborted) throw new Error('Dispatch aborted');
      const items = event.properties.items as
        | { item_id?: string; quantity?: number; price?: number }[]
        | undefined;
      const properties = {
        ...(event.properties.currency ? { currency: event.properties.currency } : {}),
        ...(typeof event.properties.value === 'number' ? { value: event.properties.value } : {}),
        ...(items
          ? {
              content_type: 'product',
              content_ids: items.map((item) => item.item_id),
              contents: items.map((item) => ({
                id: item.item_id,
                quantity: item.quantity ?? 1,
                item_price: item.price,
              })),
            }
          : {}),
      };
      win().fbq?.('consent', 'grant');
      win().fbq?.('trackSingle', config.pixelId, metaNames[event.name], properties, {
        eventID: event.eventId,
      });
    },
    setConsent(consent) {
      if (initialized) win().fbq?.('consent', consent.marketing ? 'grant' : 'revoke');
    },
    dispose() {
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
  return {
    name: 'clarity',
    category: 'analytics',
    async send(event, signal) {
      if (!initialized) {
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
      }
      await script.load(signal);
      if (signal?.aborted) throw new Error('Dispatch aborted');
      win().clarity?.('consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' });
      if (event.name !== 'page_view') win().clarity?.('event', event.name);
    },
    setConsent(consent) {
      if (initialized)
        win().clarity?.('consentv2', {
          analytics_Storage: consent.analytics ? 'granted' : 'denied',
          ad_Storage: 'denied',
        });
    },
    dispose() {
      if (initialized)
        win().clarity?.('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' });
      script.dispose();
    },
  };
}
