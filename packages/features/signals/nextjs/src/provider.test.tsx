// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
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
