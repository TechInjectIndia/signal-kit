import { registerOTel } from '@vercel/otel';
import type { Observer } from '@techinject/contracts';
import { safeRoute } from '@techinject/core';
export {
  createServerSignals as createNextSignals,
  createMetaCapiProvider,
  createOTLPObserver,
} from '@techinject/server';
/** Call once inside instrumentation.ts register, in the Node runtime only. This owns OTel registration; do not combine with an existing global provider. */
export function registerNextInstrumentation(options: Parameters<typeof registerOTel>[0]) {
  registerOTel(options);
}
/** Safe supplemental error hook; never serializes the original error or request headers. */
export function createNextRequestErrorHandler(
  observer: Observer,
  options: { enabled?: () => boolean; timeoutMs?: number } = {},
) {
  let pending = 0;
  return async (
    _error: unknown,
    request: { path: string; method: string },
    context: { routePath?: string },
  ) => {
    if (options.enabled?.() === false || pending >= 32) return;
    pending++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve()
          .then(() =>
            observer.record({
              kind: 'request',
              route: safeRoute(request.path, context.routePath),
              method: request.method.toUpperCase(),
              status: 500,
              durationMs: 0,
              error: true,
            }),
          )
          .finally(() => {
            pending--;
          }),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, options.timeoutMs ?? 1000);
        }),
      ]);
    } catch {
      /* Observability cannot fail the host error handler. */
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
