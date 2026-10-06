import { describe, expect, it, vi } from 'vitest';
import { createServerSignals, createMetaCapiProvider, createOTLPObserver } from '../src/index.js';
import type { RequestRecord } from '@signalkit/contracts';
const consent = { analytics: true, marketing: true, observability: true };
describe('server instrumentation', () => {
  it('correlates concurrent requests and normalizes routes without queries', async () => {
    const records: RequestRecord[] = [];
    const seen: string[] = [];
    const signals = createServerSignals({
      consent,
      traceOrigins: ['https://app.test'],
      observer: {
        record: (r) => {
          records.push(r);
        },
      },
      fetch: async (input) => {
        const req = input as Request;
        seen.push(req.headers.get('traceparent')!);
        return new Response('ok');
      },
    });
    const ids = ['1'.repeat(32), '2'.repeat(32)];
    await Promise.all(
      ids.map((id) =>
        signals.handle(
          new Request('https://app.test/orders/123?email=private', {
            headers: { traceparent: `00-${id}-${'3'.repeat(16)}-01` },
          }),
          async () => {
            await signals.fetch('https://app.test/api/456?token=secret');
            return new Response('ok');
          },
        ),
      ),
    );
    expect(new Set(records.map((r) => r.traceId))).toEqual(new Set(ids));
    expect(seen.map((s) => s.split('-')[1])).toEqual(ids);
    expect(JSON.stringify(records)).not.toMatch(/email|private|token|secret/);
    expect(records).toHaveLength(4);
  });
  it('never leaks context to denied origins or breaks host failures', async () => {
    const record = vi.fn(() => {
      throw new Error('observer');
    });
    const transport = vi.fn(async (input: RequestInfo | URL) => {
      expect((input as Request).headers.has('traceparent')).toBe(false);
      throw new Error('host-failure');
    });
    const signals = createServerSignals({ consent, observer: { record }, fetch: transport });
    await expect(signals.fetch('https://third-party.test/42')).rejects.toThrow('host-failure');
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: 0, error: true }));
    await expect(
      signals.handle(new Request('https://app.test/'), () => {
        throw new Error('handler');
      }),
    ).rejects.toThrow('handler');
  });
  it('preserves POST Request bodies when denied or excluded', async () => {
    const transport: typeof fetch = async (input) => new Response(await (input as Request).text());
    const denied = createServerSignals({ fetch: transport });
    expect(
      await (
        await denied.fetch(new Request('https://app.test/', { method: 'POST', body: 'payload' }))
      ).text(),
    ).toBe('payload');
    const excluded = createServerSignals({
      consent,
      excludeUrls: ['/telemetry'],
      fetch: transport,
    });
    expect(
      await (
        await excluded.fetch(
          new Request('https://app.test/telemetry', { method: 'POST', body: 'payload' }),
        )
      ).text(),
    ).toBe('payload');
  });
  it('does not instrument or propagate without consent and preserves existing context', async () => {
    const record = vi.fn();
    const transport = vi.fn(async (input: RequestInfo | URL) => new Response(String(input)));
    const denied = createServerSignals({ observer: { record }, fetch: transport });
    await denied.fetch('https://app.test/');
    expect(record).not.toHaveBeenCalled();
    const active = createServerSignals({
      consent,
      traceOrigins: ['https://app.test'],
      fetch: async (input) => {
        expect((input as Request).headers.get('traceparent')).toBe('owned-by-host');
        return new Response('ok');
      },
    });
    await active.fetch('https://app.test/', { headers: { traceparent: 'owned-by-host' } });
  });
});
describe('Meta CAPI', () => {
  const event = {
    name: 'purchase' as const,
    eventId: 'stable-order-id',
    timestamp: 1700000000000,
    properties: {
      transaction_id: 'order-1',
      currency: 'INR',
      value: 100,
      items: [{ item_id: 'sku', quantity: 2, price: 50 }],
    },
  };
  it('preserves IDs and maps ecommerce with only explicit hashed matching fields', async () => {
    let payload: any;
    const provider = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic-token',
      endpoint: 'https://collector.test/',
      userData: () => ({ em: 'a'.repeat(64) }),
      fetch: async (_url, init) => {
        payload = JSON.parse(init!.body as string);
        return Response.json({ events_received: 1 });
      },
    });
    await provider.send(event);
    expect(payload.data[0]).toMatchObject({
      event_name: 'Purchase',
      event_id: 'stable-order-id',
      event_time: 1700000000,
      custom_data: {
        order_id: 'order-1',
        currency: 'INR',
        value: 100,
        contents: [{ id: 'sku', quantity: 2, item_price: 50 }],
      },
    });
    const unsafe = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic',
      endpoint: 'https://collector.test/',
      userData: () => ({ em: 'raw@example.test' }),
    });
    await expect(unsafe.send(event)).rejects.toThrow('Invalid hashed');
  });
  it('rejects unsuccessful acknowledgment', async () => {
    const provider = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic',
      endpoint: 'https://collector.test/',
      userData: () => ({ em: 'a'.repeat(64) }),
      fetch: async () => Response.json({ events_received: 0 }),
    });
    await expect(provider.send(event)).rejects.toThrow('did not accept');
  });
});
describe('OTLP', () => {
  const record: RequestRecord = {
    kind: 'request',
    route: '/api/:id',
    method: 'GET',
    status: 500,
    durationMs: 2,
    error: true,
    traceId: '1'.repeat(32),
    spanId: '2'.repeat(16),
  };
  it('exports valid standard JSON spans and recognizes partial rejection', async () => {
    let payload: any;
    const errors: string[] = [];
    const observer = createOTLPObserver({
      endpoint: 'https://collector.test/v1/traces',
      serviceName: 'demo',
      onError: (e) => errors.push(e),
      fetch: async (_url, init) => {
        payload = JSON.parse(init!.body as string);
        return Response.json({ partialSuccess: { rejectedSpans: '1' } });
      },
    });
    await observer.record(record);
    await observer.flush!();
    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.traceId).toBe(record.traceId);
    expect(span.status.code).toBe(2);
    expect(span.startTimeUnixNano).toMatch(/^\d+$/);
    expect(errors).toEqual(['transport']);
  });
  it('aborts pending export on withdrawal and can re-enable later', async () => {
    let signal: AbortSignal | null | undefined;
    let calls = 0;
    const observer = createOTLPObserver({
      endpoint: 'https://collector.test/',
      serviceName: 'demo',
      fetch: async (_url, init) => {
        calls++;
        signal = init?.signal;
        return new Promise(() => {});
      },
    });
    const pending = observer.record(record);
    await Promise.resolve();
    observer.setConsent!({ analytics: false, marketing: false, observability: false });
    await pending;
    expect(signal?.aborted).toBe(true);
    await observer.record(record);
    expect(calls).toBe(1);
    observer.dispose!();
  });
  it('bounds hanging transport and reports capacity without hanging flush', async () => {
    const errors: string[] = [];
    const observer = createOTLPObserver({
      endpoint: 'https://collector.test/v1/traces',
      serviceName: 'demo',
      timeoutMs: 10,
      maxPending: 1,
      onError: (e) => errors.push(e),
      fetch: () => new Promise(() => {}),
    });
    void observer.record(record);
    await observer.record(record);
    await observer.flush!();
    expect(errors).toEqual(['capacity', 'timeout']);
    observer.dispose!();
  });
});
