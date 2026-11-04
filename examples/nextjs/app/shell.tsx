'use client';
import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { SignalKitProvider, useSignals, type BrowserConfig } from '@techinject/nextjs';
import type { Consent, EventInput, DispatchResult } from '@techinject/contracts';

type Demo = { track(input: EventInput): Promise<DispatchResult> };
const Context = createContext<Demo | null>(null);
export function useDemo() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('Demo provider missing');
  return ctx;
}
export function DemoShell({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<Consent>({
    analytics: false,
    marketing: false,
    observability: false,
  });
  const [lines, setLines] = useState<string[]>([]);
  const config = useMemo<BrowserConfig>(() => {
    const append = (line: string) => setLines((previous) => [line, ...previous].slice(0, 30));
    return {
      traceOrigins: typeof location === 'undefined' ? [] : [location.origin],
      // Landing UTM/click-ID/referrer capture; persisted in localStorage only under marketing consent.
      attribution: { category: 'marketing' },
      providers: [
        {
          name: 'local-analytics',
          category: 'analytics',
          send(event) {
            append(`${event.name} · ${event.eventId.slice(0, 8)}`);
          },
        },
        { name: 'local-marketing', category: 'marketing', send() {} },
      ],
      observer: {
        record(record) {
          append(
            `${record.method} ${record.route} · ${record.status} · ${Math.round(record.durationMs)}ms`,
          );
        },
      },
      onDiagnostic(result) {
        append(result.outcomes.map((o) => `${o.provider}: ${o.status}`).join(' / '));
      },
    };
  }, []);
  return (
    <SignalKitProvider config={{ ...config, consent }}>
      <Lab consent={consent} setConsent={setConsent} lines={lines} setLines={setLines}>
        {children}
      </Lab>
    </SignalKitProvider>
  );
}
function Lab({
  children,
  consent,
  setConsent,
  lines,
  setLines,
}: {
  children: React.ReactNode;
  consent: Consent;
  setConsent: (value: Consent) => void;
  lines: string[];
  setLines: (value: string[]) => void;
}) {
  const signals = useSignals();
  const track = (input: EventInput) => signals.track(input);
  const [attribution, setAttribution] = useState(() => signals.getAttribution());
  useEffect(() => {
    setAttribution(signals.getAttribution());
  }, [signals, consent, lines]);
  const describe = (touch: NonNullable<typeof attribution.first>) =>
    `${touch.channel} · ${touch.source} / ${touch.medium}${touch.campaign ? ` · ${touch.campaign}` : ''}${touch.term ? ` · “${touch.term}”` : ''}`;
  return (
    <Context.Provider value={{ track }}>
      <header className="top">
        <Link className="brand" href="/" aria-label="SignalKit lab home">
          signal-kit<span aria-hidden="true"> ◉</span>
        </Link>
        <Link className="tag" href="/connections">
          Connections →
        </Link>
      </header>
      <div className="grid">
        <main>{children}</main>
        <aside aria-label="Instrumentation inspector">
          <p className="eyebrow">LIVE INSPECTOR</p>
          <h2>Choose what can leave.</h2>
          <div className="consent">
            {(['analytics', 'marketing', 'observability'] as const).map((category) => (
              <label key={category}>
                <input
                  type="checkbox"
                  checked={consent[category]}
                  onChange={(e) => setConsent({ ...consent, [category]: e.target.checked })}
                />
                {category}
              </label>
            ))}
          </div>
          <p className="note">
            All categories start denied. Grant consent, then navigate or emit a new event. Dropped
            events are never replayed.
          </p>
          <div className="controls">
            <button onClick={() => void fetch('/api/ping')}>Test API</button>
            <button onClick={() => void signals?.page()}>Track this page</button>
            <button onClick={() => setLines([])}>Clear</button>
          </div>
          <p className="status" role="status">
            {'SDK ready · local transports'}
          </p>
          <dl className="source" aria-label="Visit source">
            <dt>First touch</dt>
            <dd>{attribution.first ? describe(attribution.first) : 'direct or not captured'}</dd>
            <dt>Last touch</dt>
            <dd>{attribution.last ? describe(attribution.last) : 'direct or not captured'}</dd>
          </dl>
          <p className="note">
            Open this lab with ?gclid=test or ?utm_source=bing&utm_medium=cpc&utm_term=notebook to
            see the source. It persists only while marketing consent is granted.
          </p>
          {lines.length ? (
            <ol className="feed" aria-label="Recorded activity">
              {lines.map((line, i) => (
                <li key={`${i}:${line}`}>{line}</li>
              ))}
            </ol>
          ) : (
            <p className="empty">
              Your activity appears here.
              <br />
              Try granting analytics and opening the sample store.
            </p>
          )}
          <p className="note">
            “sent” means the local adapter completed. Provider acceptance, attribution and delivery
            require separate validation.
          </p>
        </aside>
      </div>
    </Context.Provider>
  );
}
