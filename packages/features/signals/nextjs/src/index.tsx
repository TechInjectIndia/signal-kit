'use client';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createBrowserSignals, type BrowserConfig, type BrowserSignals } from '@techinject/browser';
import type { EventDefinition } from '@techinject/browser';
// useLayoutEffect warns on the server; consent application is a no-op there.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const Context = createContext<BrowserSignals<readonly EventDefinition[]> | null>(null);
export function SignalKitProvider<const Events extends readonly EventDefinition[] = readonly []>({
  config,
  children,
}: {
  config: BrowserConfig<Events>;
  children: ReactNode;
}) {
  const reference = useRef<BrowserSignals<Events> | null>(null);
  if (!reference.current) reference.current = createBrowserSignals({ ...config, autoTrack: false });
  const signals = reference.current;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    signals.start();
    return () => {
      mounted.current = false;
      signals.stop();
      queueMicrotask(() => {
        if (!mounted.current) signals.dispose();
      });
    };
  }, [signals]);
  // Layout effects run before any child passive effect in the same commit, so children
  // that track on first render or on a consent change never observe stale consent. The
  // initial consent is already in the instance config; only later changes are applied.
  // Passive start() runs after this, so the instance is started before a changed consent
  // can fire a consent-time page view only on updates (already started by then).
  const applied = useRef(config.consent);
  useIsomorphicLayoutEffect(() => {
    if (config.consent && config.consent !== applied.current) {
      applied.current = config.consent;
      signals.setConsent(config.consent);
    }
  }, [signals, config.consent]);
  return (
    <Context.Provider value={signals as BrowserSignals<readonly EventDefinition[]>}>
      {children}
    </Context.Provider>
  );
}
export function useSignals<Events extends readonly EventDefinition[] = readonly []>() {
  const signals = useContext(Context);
  if (!signals) throw new Error('useSignals requires SignalKitProvider');
  return signals as BrowserSignals<Events>;
}
export {
  createBrowserSignals,
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
