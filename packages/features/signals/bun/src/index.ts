import type { ServerSignals } from '@techinject/server';

/** Wrap the fallback fetch handler. Bun route-table handlers must each be wrapped too. */
export function instrumentBunFetch<TServer>(
  signals: ServerSignals,
  handler: (request: Request, server: TServer) => Response | Promise<Response>,
  routeResolver?: (request: Request) => string | undefined,
): (request: Request, server: TServer) => Promise<Response> {
  return (request, server) =>
    signals.handle(request, () => handler(request, server), { route: routeResolver?.(request) });
}

/**
 * Automatically instruments all route handlers in Bun's declarative `routes` table,
 * ensuring telemetry and distributed tracing are recorded without manual wrapping.
 */
export function instrumentBunRoutes<TRoutes extends Record<string, unknown>>(
  signals: ServerSignals,
  routes: TRoutes,
): TRoutes {
  const wrapped: Record<string, unknown> = {};
  for (const [routePattern, handler] of Object.entries(routes)) {
    if (typeof handler === 'function') {
      wrapped[routePattern] = (req: Request, server: unknown) =>
        signals.handle(
          req,
          () => (handler as (r: Request, s: unknown) => Response | Promise<Response>)(req, server),
          { route: routePattern },
        );
    } else if (handler && typeof handler === 'object') {
      const methodMap: Record<string, unknown> = {};
      for (const [method, methodHandler] of Object.entries(handler)) {
        if (typeof methodHandler === 'function') {
          methodMap[method] = (req: Request, server: unknown) =>
            signals.handle(
              req,
              () =>
                (methodHandler as (r: Request, s: unknown) => Response | Promise<Response>)(
                  req,
                  server,
                ),
              { route: routePattern },
            );
        } else {
          methodMap[method] = methodHandler;
        }
      }
      wrapped[routePattern] = methodMap;
    } else {
      wrapped[routePattern] = handler;
    }
  }
  return wrapped as TRoutes;
}
