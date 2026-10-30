import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestEvent } from '@sveltejs/kit';
import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import type { EventDefinition } from '@techinject/server';
import { createServerSignals, type ServerConfig, type ServerSignals } from '@techinject/server';

/** Node runtime only. Return fresh observer/provider instances for each request. */
export function createSvelteKitHooks<const Events extends readonly EventDefinition[] = readonly []>(
  getConfig: (event: RequestEvent) => ServerConfig<Events> | Promise<ServerConfig<Events>>,
): { handle: Handle; handleFetch: HandleFetch } {
  const active = new AsyncLocalStorage<ServerSignals<Events>>();
  const handle: Handle = async ({ event, resolve }) => {
    let config: ServerConfig<Events>;
    let signals: ServerSignals<Events>;
    try {
      config = await getConfig(event);
      signals = createServerSignals(config);
    } catch {
      // Fail closed for telemetry, without inheriting a parent request's policy.
      return active.exit(() => resolve(event));
    }
    try {
      return await active.run(signals, () =>
        signals.handle(event.request, () => resolve(event), {
          route: event.route?.id ?? undefined,
        }),
      );
    } finally {
      // A host observer flush can hang; never let it hold a response forever.
      const timeout = Number.isFinite(config.timeoutMs)
        ? Math.max(1, Math.min(30000, config.timeoutMs!))
        : 2000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          signals.flush(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeout);
          }),
        ]);
      } catch {
        /* telemetry must not replace a host response/error */
      } finally {
        if (timer) clearTimeout(timer);
        signals.dispose();
      }
    }
  };
  const handleFetch: HandleFetch = ({ request, fetch }) => {
    const signals = active.getStore();
    // Preserve SvelteKit's fetch (cookies, internal routes, SSR response handling).
    return signals ? signals.wrapFetch(fetch)(request) : fetch(request);
  };
  return { handle, handleFetch };
}
export { createOTLPObserver } from '@techinject/server';
export type { ServerConfig } from '@techinject/server';

export { createSentryObserver, combineObservers } from '@techinject/server';
export type { SentryClient, SentryEvent, SentryOptions } from '@techinject/server';
