'use client';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { createBrowserSignals, type BrowserConfig, type BrowserSignals } from '@techinject/browser';
import type { EventDefinition } from '@techinject/browser';
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
  useEffect(() => {
    if (config.consent) signals.setConsent(config.consent);
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
} from '@techinject/browser';
export type { BrowserConfig, BrowserSignals } from '@techinject/browser';

export { defineEvent } from '@techinject/browser';
export type { EventDefinition, RegisteredEventInput } from '@techinject/browser';
