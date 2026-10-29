import type { Observer, RequestRecord } from '@techinject/contracts';
import { safeRoute } from '@techinject/core';

/** Minimal bridge to a host-owned Sentry client. No SDK initialization or global mutation. */
export interface SentryClient {
  captureEvent(event: SentryEvent): string | undefined;
  flush?(timeoutMs: number): PromiseLike<boolean>;
}
export interface SentryEvent {
  level: 'error';
  message: string;
  exception?: { values: Array<{ type: string; value: string }> };
  tags: Record<string, string>;
  fingerprint: string[];
}
export interface SentryOptions {
  client: SentryClient;
  timeoutMs?: number;
  onError?: (reason: 'transport' | 'timeout') => void;
}

const deadlineMs = (value?: number) =>
  Number.isFinite(value) ? Math.max(10, Math.min(30_000, value!)) : 2000;

/** Request failure summaries and explicitly captured, classified exceptions only. */
export function createSentryObserver(options: SentryOptions): Observer & {
  captureException(error: unknown, context?: Partial<RequestRecord>): void;
} {
  let allowed = false;
  let disposed = false;
  let flushing: Promise<void> | undefined;
  const timeout = deadlineMs(options.timeoutMs);
  const diagnostic = (reason: 'transport' | 'timeout') => {
    try {
      options.onError?.(reason);
    } catch {
      /* isolated */
    }
  };
  const tags = (record: Partial<RequestRecord>) => {
    const result: Record<string, string> = { 'signalkit.source': 'server' };
    if (record.route) result['http.route'] = safeRoute(record.route);
    if (record.method)
      result['http.request.method'] =
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)$/.test(record.method)
          ? record.method
          : 'OTHER';
    if (Number.isInteger(record.status) && record.status! >= 0 && record.status! <= 599)
      result['http.response.status_code'] = String(record.status);
    if (/^[a-f0-9]{32}$/.test(record.traceId ?? '') && !/^0+$/.test(record.traceId!))
      result['signalkit.trace_id'] = record.traceId!;
    if (/^[a-f0-9]{16}$/.test(record.spanId ?? '') && !/^0+$/.test(record.spanId!))
      result['signalkit.span_id'] = record.spanId!;
    return result;
  };
  const capture = (event: SentryEvent) => {
    if (!allowed || disposed) return;
    try {
      options.client.captureEvent(event);
    } catch {
      diagnostic('transport');
    }
  };
  return {
    record(record) {
      if (!allowed || disposed || !(record.status === 0 || record.status >= 500)) return;
      const metadata = tags(record);
      capture({
        level: 'error',
        message: 'SignalKit request failed',
        tags: metadata,
        fingerprint: [
          'signalkit-request',
          metadata['http.request.method'] ?? 'OTHER',
          metadata['http.route'] ?? '/',
          metadata['http.response.status_code'] ?? '0',
        ],
      });
    },
    captureException(error, context = {}) {
      if (!allowed || disposed) return;
      // Never inspect arbitrary error properties or export a raw message/stack/cause.
      let type = 'Error';
      try {
        for (const builtin of [
          TypeError,
          RangeError,
          SyntaxError,
          ReferenceError,
          URIError,
          EvalError,
        ])
          if (error instanceof builtin) {
            type = builtin.name;
            break;
          }
      } catch {
        /* hostile objects retain the generic classification */
      }
      const metadata = tags(context);
      capture({
        level: 'error',
        message: 'SignalKit exception',
        exception: { values: [{ type, value: 'Application exception (details omitted)' }] },
        tags: metadata,
        fingerprint: ['signalkit-exception', type, metadata['http.route'] ?? '/'],
      });
    },
    setConsent(consent) {
      allowed = consent.observability === true;
    },
    flush() {
      if (disposed || !allowed || !options.client.flush) return Promise.resolve();
      if (flushing) return flushing;
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          diagnostic('timeout');
          resolve();
        }, timeout);
      });
      const delivery = Promise.resolve()
        .then(async () => {
          if (!allowed || disposed) return;
          if (!(await options.client.flush!(timeout))) diagnostic('transport');
        })
        .catch(() => diagnostic('transport'));
      flushing = Promise.race([delivery, deadline]).finally(() => {
        clearTimeout(timer!);
        flushing = undefined;
      });
      return flushing;
    },
    dispose() {
      disposed = true;
      // The host owns the shared Sentry client and already-queued events.
    },
  };
}

/** Fan out to independent observers; one rejection or stalled observer cannot block the rest. */
export function combineObservers(
  observers: readonly Observer[],
  options: { timeoutMs?: number; maxPending?: number } = {},
): Observer {
  const children = [...observers];
  const pending = new Set<Promise<void>>();
  const maxPending = Number.isFinite(options.maxPending)
    ? Math.max(1, Math.min(100, Math.floor(options.maxPending!)))
    : 20;
  const timeout = deadlineMs(options.timeoutMs);
  let disposed = false;
  let allowed = false;
  const bounded = async (operation: () => void | Promise<void>) => {
    let timer: ReturnType<typeof setTimeout>;
    await Promise.race([
      Promise.resolve()
        .then(operation)
        .catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeout);
      }),
    ]).finally(() => clearTimeout(timer!));
  };
  return {
    record(record) {
      if (disposed || !allowed || pending.size >= maxPending) return;
      const task = Promise.all(
        children.map((child) =>
          bounded(() => {
            if (!disposed && allowed) return child.record({ ...record });
          }),
        ),
      )
        .then(() => undefined)
        .finally(() => pending.delete(task));
      pending.add(task);
      return task;
    },
    setConsent(consent) {
      if (disposed) return;
      allowed = consent.observability === true;
      for (const child of children) {
        try {
          child.setConsent?.({ ...consent });
        } catch {
          /* isolated */
        }
      }
    },
    async flush() {
      if (disposed) return;
      await Promise.all([...pending]);
      if (disposed) return;
      await Promise.all(children.map((child) => bounded(() => child.flush?.())));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const child of children) {
        try {
          child.dispose?.();
        } catch {
          /* isolated */
        }
      }
    },
  };
}
