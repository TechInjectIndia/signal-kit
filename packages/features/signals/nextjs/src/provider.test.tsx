// @vitest-environment jsdom
import { act, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import * as next from './index.js';
import { SignalKitProvider, useSignals } from './index.js';
it('mounts a client provider and restores navigation instrumentation on unmount', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div');
  const root = createRoot(element);
  const original = history.pushState;
  const events: unknown[] = [];
  function Child() {
    const signals = useSignals();
    return (
      <button
        onClick={() => {
          void signals.page('/explicit');
        }}
      >
        Track
      </button>
    );
  }
  await act(async () =>
    root.render(
      <StrictMode>
        <SignalKitProvider
          config={{
            consent: { analytics: true, marketing: false, observability: false },
            providers: [
              {
                name: 'local',
                category: 'analytics',
                send: (event) => {
                  events.push(event);
                },
              },
            ],
          }}
        >
          <Child />
        </SignalKitProvider>
      </StrictMode>,
    ),
  );
  expect(events).toHaveLength(1);
  expect(history.pushState).not.toBe(original);
  await act(async () => root.unmount());
  expect(history.pushState).toBe(original);
});

const on = { analytics: true, marketing: false, observability: false };
const off = { analytics: false, marketing: false, observability: false };

it('exports the new browser APIs', () => {
  expect(typeof next.SignalKitProvider).toBe('function');
  expect(typeof next.useSignals).toBe('function');
  expect(typeof next.createBrowserSignals).toBe('function');
});

it('children effects see configured consent on first render under StrictMode', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  const seen: unknown[] = [];
  function Child() {
    const signals = useSignals();
    useEffect(() => {
      seen.push(signals.getConsent());
    }, [signals]);
    return null;
  }
  await act(async () =>
    root.render(
      <StrictMode>
        <SignalKitProvider config={{ consent: on }}>
          <Child />
        </SignalKitProvider>
      </StrictMode>,
    ),
  );
  expect(seen.length).toBeGreaterThan(0);
  for (const consent of seen) expect(consent).toMatchObject(on);
  await act(async () => root.unmount());
});

it('applies a consent prop change before child effects and fires pageOnConsent after it', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  history.replaceState({}, '', '/landing');
  const root = createRoot(document.createElement('div'));
  const log: string[] = [];
  const providers = [
    {
      name: 'local',
      category: 'analytics' as const,
      eventFamily: 'ga4' as const,
      send: (event: { name: string }) => {
        log.push(`send:${event.name}`);
      },
    },
  ];
  let grant: () => void = () => {};
  function Child() {
    const signals = useSignals();
    useEffect(() => {
      log.push(`child:${signals.getConsent().analytics}`);
    });
    return null;
  }
  function Host() {
    const [consent, setConsent] = useState(off);
    grant = () => setConsent(on);
    return (
      <SignalKitProvider config={{ consent, providers, pageOnConsent: true }}>
        <Child />
      </SignalKitProvider>
    );
  }
  await act(async () => root.render(<Host />));
  await act(async () => grant());
  await act(async () => {
    await Promise.resolve();
  });
  const grantIndex = log.indexOf('child:true');
  expect(grantIndex).toBeGreaterThanOrEqual(0);
  expect(log.filter((entry) => entry.startsWith('send:'))).toHaveLength(1);
  expect(log.indexOf('send:page_view')).toBeGreaterThan(-1);
  // Child saw granted consent in the same commit the prop changed.
  expect(log.indexOf('child:false')).toBeLessThan(grantIndex);
  await act(async () => root.unmount());
});
