import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestEvent } from '@sveltejs/kit';
import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import { createServerSignals, type ServerConfig, type ServerSignals } from '@techinject/server';

/** Node runtime only. Return fresh observer/provider instances for each request. */
export function createSvelteKitHooks(
  getConfig: (event: RequestEvent) => ServerConfig | Promise<ServerConfig>,
): { handle: Handle; handleFetch: HandleFetch } {
  const active = new AsyncLocalStorage<ServerSignals>();
  const handle: Handle = async ({ event, resolve }) => {
    const config = await getConfig(event);
    const signals = createServerSignals(config);
    try {
      return await active.run(signals, () =>
        signals.handle(event.request, () => resolve(event), {
          route: event.route.id ?? undefined,
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
