import type { ServerSignals } from '@signalkit/server';

/** Wrap the fallback fetch handler. Bun route-table handlers must each be wrapped too. */
export function instrumentBunFetch<TServer>(
  signals: ServerSignals,
  handler: (request: Request, server: TServer) => Response | Promise<Response>,
  routeResolver?: (request: Request) => string | undefined,
): (request: Request, server: TServer) => Promise<Response> {
  return (request, server) =>
    signals.handle(request, () => handler(request, server), { route: routeResolver?.(request) });
}
