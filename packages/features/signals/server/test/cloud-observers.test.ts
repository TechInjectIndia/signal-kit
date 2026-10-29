import { describe, expect, it, vi } from 'vitest';
import {
  createOTLPObserver,
  createSentryObserver,
  combineObservers,
  createServerSignals,
} from '../src/index.js';
import type { RequestRecord } from '@techinject/contracts';
const consent = { analytics: false, marketing: false, observability: true };
const record: RequestRecord = {
  kind: 'request',
  route: '/orders/123?secret=hidden',
  method: 'GET',
  status: 503,
  durationMs: 5,
  error: true,
  traceId: 'a'.repeat(32),
  spanId: 'b'.repeat(16),
};

describe('configurable OTLP backend', () => {
  it.each([
    { name: 'local SigNoz', endpoint: 'http://localhost:4318/v1/traces', headers: {} },
    {
      name: 'local Grafana Tempo',
      endpoint: 'http://tempo:4318/v1/traces',
      headers: { 'X-Scope-OrgID': 'synthetic' },
    },
    {
      name: 'Grafana Cloud',
      endpoint: 'https://grafana.test/otlp/v1/traces',
      headers: { Authorization: 'Basic synthetic' },
    },
    {
      name: 'SigNoz Cloud',
      endpoint: 'https://signoz.test/v1/traces',
      headers: { 'signoz-ingestion-key': 'synthetic' },
    },
  ])(
    'uses exact endpoint and injected headers for $name under host consent',
    async ({ endpoint, headers }) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}'));
      const observer = createOTLPObserver({ endpoint, headers, serviceName: 'shop', fetch });
      const signals = createServerSignals({ observer });
      const request = new Request('https://shop.test/orders/123?secret=hidden');
      const handle = () => signals.handle(request, () => new Response('failure', { status: 503 }));
      await handle();
      await signals.flush();
      expect(fetch).not.toHaveBeenCalled();
      signals.setConsent(consent);
      await handle();
      await signals.flush();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[0]).toBe(endpoint);
      expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({
        ...headers,
        'content-type': 'application/json',
      });
      expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('hidden');
      signals.setConsent({ ...consent, observability: false });
      await handle();
      await signals.flush();
      expect(fetch).toHaveBeenCalledTimes(1);
      signals.dispose();
    },
  );
});

describe('Sentry bridge and observer fanout', () => {
  it('requires consent, sends safe error classification and trace tags, and stops on disposal', () => {
    const captureEvent = vi.fn(() => 'id');
    const sentry = createSentryObserver({ client: { captureEvent } });
    sentry.record(record);
    expect(captureEvent).not.toHaveBeenCalled();
    sentry.setConsent?.(consent);
    sentry.captureException(new TypeError('private@example.test password'), record);
    const event = captureEvent.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      exception: { values: [{ type: 'TypeError' }] },
      tags: { 'http.route': '/orders/:id', 'signalkit.trace_id': 'a'.repeat(32) },
    });
    expect(JSON.stringify(event)).not.toMatch(/password|private@|hidden|stack/);
    sentry.record({ ...record, status: 404 });
    expect(captureEvent).toHaveBeenCalledTimes(1);
    sentry.setConsent?.({ ...consent, observability: false });
    sentry.captureException(new Error());
    sentry.dispose?.();
    sentry.setConsent?.(consent);
    sentry.record(record);
    expect(captureEvent).toHaveBeenCalledTimes(1);
  });
  it('preserves thrown host errors and fans out without shared record mutation', async () => {
    const captureEvent = vi.fn(() => 'id');
    const sentry = createSentryObserver({ client: { captureEvent, flush: async () => true } });
    const observer = combineObservers([
      {
        record(r) {
          r.route = '/mutated';
          throw new Error('unavailable');
        },
      },
      sentry,
    ]);
    const signals = createServerSignals({ consent, observer });
    const original = new Error('secret');
    await expect(
      signals.handle(new Request('https://app.test/orders/123'), () => {
        throw original;
      }),
    ).rejects.toBe(original);
    await signals.flush();
    expect(captureEvent.mock.calls[0]?.[0]).toMatchObject({
      tags: { 'http.route': '/orders/:id' },
    });
    signals.dispose();
  });
  it('bounds stalled Sentry and composite flush and isolates rejection', async () => {
    vi.useFakeTimers();
    try {
      const onError = vi.fn();
      const sentry = createSentryObserver({
        client: { captureEvent: () => 'id', flush: () => new Promise(() => {}) },
        timeoutMs: 20,
        onError,
      });
      sentry.setConsent?.(consent);
      const first = sentry.flush!();
      expect(sentry.flush!()).toBe(first);
      await vi.advanceTimersByTimeAsync(21);
      await first;
      expect(onError).toHaveBeenCalledWith('timeout');
      const observer = combineObservers(
        [
          { record() {}, flush: () => new Promise(() => {}) },
          {
            record() {
              throw new Error();
            },
            flush: async () => {
              throw new Error();
            },
          },
        ],
        { timeoutMs: 20 },
      );
      observer.setConsent?.(consent);
      const pending = observer.flush!();
      await vi.advanceTimersByTimeAsync(21);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('OTLP lifecycle', () => {
  it.each(['withdraw', 'dispose'] as const)(
    'aborts in-flight export on %s without reporting transport failure',
    async (action) => {
      const onError = vi.fn();
      let signal: AbortSignal | undefined;
      const fetch = vi.fn<typeof globalThis.fetch>((_url, init) => {
        signal = init?.signal ?? undefined;
        return new Promise(() => {});
      });
      const observer = createOTLPObserver({
        endpoint: 'https://cloud.test/otlp/v1/traces',
        serviceName: 'shop',
        headers: { Authorization: 'Basic synthetic' },
        fetch,
        onError,
      });
      observer.setConsent?.(consent);
      const pending = observer.record(record);
      await Promise.resolve();
      expect(signal?.aborted).toBe(false);
      if (action === 'withdraw') observer.setConsent?.({ ...consent, observability: false });
      else observer.dispose?.();
      expect(signal?.aborted).toBe(true);
      await pending;
      await observer.flush?.();
      await observer.record(record);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    },
  );
  it('reports partial rejection and times out an uncooperative cloud transport', async () => {
    vi.useFakeTimers();
    try {
      const onError = vi.fn();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ partialSuccess: { rejectedSpans: '1' } })),
        )
        .mockImplementationOnce(() => new Promise(() => {}));
      const observer = createOTLPObserver({
        endpoint: 'https://cloud.test/v1/traces',
        serviceName: 'shop',
        headers: { 'signoz-ingestion-key': 'synthetic' },
        fetch,
        timeoutMs: 20,
        onError,
      });
      observer.setConsent?.(consent);
      await observer.record(record);
      expect(onError).toHaveBeenCalledWith('transport');
      const pending = observer.record(record);
      await vi.advanceTimersByTimeAsync(21);
      await pending;
      await observer.flush?.();
      expect(onError.mock.calls).toEqual([['transport'], ['timeout']]);
      expect(fetch.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('composite lifecycle', () => {
  it('drops excess pending records and flushes children only after accepted work completes', async () => {
    let finish!: () => void;
    const calls: string[] = [];
    const child = {
      record: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            calls.push('record');
            finish = resolve;
          }),
      ),
      flush: vi.fn(async () => {
        calls.push('flush');
      }),
    };
    const observer = combineObservers([child], { maxPending: 1 });
    observer.setConsent?.(consent);
    const first = observer.record(record);
    await observer.record(record);
    const flushing = observer.flush!();
    await Promise.resolve();
    expect(child.record).toHaveBeenCalledTimes(1);
    expect(child.flush).not.toHaveBeenCalled();
    finish();
    await first;
    await flushing;
    expect(calls).toEqual(['record', 'flush']);
  });
  it('propagates isolated consent and disposal while denying queued microtasks', async () => {
    const child = { record: vi.fn(), setConsent: vi.fn(), dispose: vi.fn() };
    const observer = combineObservers([
      {
        record() {},
        setConsent(value) {
          value.observability = false;
          throw new Error();
        },
        dispose() {
          throw new Error();
        },
      },
      child,
    ]);
    await observer.record(record);
    expect(child.record).not.toHaveBeenCalled();
    observer.setConsent?.(consent);
    expect(child.setConsent).toHaveBeenLastCalledWith(consent);
    const pending = observer.record(record);
    observer.setConsent?.({ ...consent, observability: false });
    await pending;
    expect(child.record).not.toHaveBeenCalled();
    expect(child.setConsent).toHaveBeenLastCalledWith({ ...consent, observability: false });
    observer.dispose?.();
    observer.dispose?.();
    observer.setConsent?.(consent);
    await observer.record(record);
    expect(child.dispose).toHaveBeenCalledTimes(1);
    expect(child.setConsent).toHaveBeenCalledTimes(2);
    expect(child.record).not.toHaveBeenCalled();
  });
});

describe('Sentry failure isolation', () => {
  it.each(['false', 'reject'] as const)(
    'isolates capture throws and %s flush outcomes',
    async (outcome) => {
      const onError = vi.fn();
      const observer = createSentryObserver({
        client: {
          captureEvent() {
            throw new Error('private transport detail');
          },
          flush: async () => {
            if (outcome === 'reject') throw new Error('private flush detail');
            return false;
          },
        },
        onError,
      });
      observer.setConsent?.(consent);
      expect(() => observer.record(record)).not.toThrow();
      expect(() => observer.captureException(new Error('private exception'))).not.toThrow();
      await expect(observer.flush!()).resolves.toBeUndefined();
      expect(onError.mock.calls).toEqual([['transport'], ['transport'], ['transport']]);
    },
  );
});
