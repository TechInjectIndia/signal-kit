import { registerOTel } from '@vercel/otel';
import type { Observer } from '@techinject/contracts';
import { safeRoute, parseTraceparent } from '@techinject/core';
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
    request: {
      path: string;
      method: string;
      headers?: Headers | Record<string, string | string[] | undefined>;
    },
    context: {
      routePath?: string;
      traceId?: string;
      spanId?: string;
      parentSpanId?: string;
    } = {},
  ) => {
    if (options.enabled?.() === false || pending >= 32) return;
    pending++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let traceId = context.traceId;
      let spanId = context.spanId;
      let parentSpanId = context.parentSpanId;
      if (!traceId && request.headers) {
        let traceHeader: string | null = null;
        if (typeof (request.headers as Headers).get === 'function') {
          traceHeader = (request.headers as Headers).get('traceparent');
        } else if (typeof request.headers === 'object') {
          const val = (request.headers as Record<string, unknown>)['traceparent'];
          traceHeader = typeof val === 'string' ? val : null;
        }
        const parsed = parseTraceparent(traceHeader);
        if (parsed) {
          traceId = parsed.traceId;
          parentSpanId = parsed.spanId;
        }
      }
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
              ...(traceId ? { traceId } : {}),
              ...(spanId ? { spanId } : {}),
              ...(parentSpanId ? { parentSpanId } : {}),
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
