import type { EventDefinition } from '@techinject/browser';
import { createBrowserSignals, type BrowserConfig, type BrowserSignals } from '@techinject/browser';

/** Construct per layout (SSR-safe); mount only from Svelte's onMount. */
export function createSvelteKitClient<
  const Events extends readonly EventDefinition[] = readonly [],
>(config: BrowserConfig<Events> = {}) {
  let signals: BrowserSignals<Events> | undefined;
  return {
    mount() {
      if (typeof window === 'undefined')
        throw new Error('Mount SignalKit in onMount, not during SSR');
      signals ??= createBrowserSignals({ ...config, autoTrack: false });
      // Start before the host applies consent so a consent-time page view can fire.
      signals.start();
      return signals;
    },
    getSignals() {
      if (!signals) throw new Error('SignalKit client has not mounted');
      return signals;
    },
    dispose() {
      signals?.dispose();
      signals = undefined;
    },
  };
}
export {
  createGA4Provider,
  createMetaPixelProvider,
  createClarityProvider,
  auditAttribution,
} from '@techinject/browser';
export type {
  BrowserConfig,
  BrowserSignals,
  AttributionFinding,
  AttributionAuditOptions,
  BrowserTrackOptions,
  PageOnConsentOptions,
  ProviderIds,
  ProviderIdsOptions,
  UserIdentity,
  CustomerType,
} from '@techinject/browser';
export { defineEvent } from '@techinject/browser';
export type { EventDefinition, RegisteredEventInput } from '@techinject/browser';
