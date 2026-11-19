import { exampleEvents, z } from '../../contracts/test/consumer-events.js';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createServerSignals,
  createMetaCapiProvider,
  createOTLPObserver,
  defineEvent,
} from '../src/index.js';
import type { RequestRecord } from '@techinject/contracts';
const consent = { analytics: true, marketing: true, observability: true };
describe('server instrumentation', () => {
  it('records the valid existing outbound wire trace instead of unrelated local context', async () => {
    const records: RequestRecord[] = [];
    const header = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`;
    const signals = createServerSignals({
      consent,
      observer: {
        record: (record) => {
          records.push(record);
        },
      },
      traceOrigins: ['https://app.test'],
      fetch: async (input) => {
        expect((input as Request).headers.get('traceparent')).toBe(header);
        return new Response('ok');
      },
    });
    await signals.handle(new Request('https://app.test/'), async () => {
      await signals.fetch('https://app.test/outbound', { headers: { traceparent: header } });
      return new Response('ok');
    });
    await signals.flush();
    expect(records[0]).toMatchObject({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) });
    expect(records[0]?.parentSpanId).toBeUndefined();
    expect(records[1]?.traceId).not.toBe(records[0]?.traceId);
    signals.dispose();
  });
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
  it('preserves explicit consumer vendor properties without predefined commerce rewriting', async () => {
    const definition = defineEvent({
      name: 'support_open',
      schema: z.object({ order: z.string(), products: z.array(z.string()) }),
      map: {
        meta: {
          name: 'support_open',
          mode: 'custom',
          properties: { order_id: 'order', content_ids: 'products' },
        },
      },
    });
    let payload: any;
    const signals = createServerSignals({
      events: [definition],
      consent,
      providers: [
        createMetaCapiProvider({
          pixelId: '123',
          accessToken: 'synthetic',
          endpoint: 'https://collector.test/',
          eventSourceUrl: 'https://shop.test/checkout',
          userData: () => ({ em: 'a'.repeat(64), client_user_agent: 'Mozilla/5.0 (synthetic)' }),
          fetch: async (_url, init) => {
            payload = JSON.parse(init!.body as string);
            return Response.json({ events_received: 1 });
          },
        }),
      ],
    });
    expect(
      (
        await signals.track({
          name: 'support_open',
          eventId: 'consumer-projection',
          properties: { order: 'order_demo', products: ['notebook'] },
        })
      ).outcomes[0]?.status,
    ).toBe('sent');
    expect(payload.data[0]).toMatchObject({
      event_name: 'support_open',
      event_id: 'consumer-projection',
      custom_data: { order_id: 'order_demo', content_ids: ['notebook'] },
    });
    signals.dispose();
  });
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
      eventSourceUrl: 'https://shop.test/checkout',
      userData: () => ({ em: 'a'.repeat(64), client_user_agent: 'Mozilla/5.0 (synthetic)' }),
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
      user_data: { em: ['a'.repeat(64)], client_user_agent: 'Mozilla/5.0 (synthetic)' },
      custom_data: {
        order_id: 'order-1',
        currency: 'INR',
        value: 100,
        contents: [{ id: 'sku', quantity: 2, item_price: 50 }],
      },
    });

    await provider.send({
      name: 'login',
      eventId: 'login-server-123',
      timestamp: 1700000000000,
      properties: { method: 'otp' },
    });
    expect(payload.data[0].event_name).toBe('Login');

    const consumerSignals = createServerSignals({
      events: exampleEvents,
      consent,
      providers: [provider],
    });
    await consumerSignals.track({
      name: 'custom_event',
      eventId: 'custom-server-123',
      timestamp: 1700000000000,
      properties: { action: 'video_play' },
    });
    expect(payload.data[0].event_name).toBe('video_play');
    expect(payload.data[0].custom_data).not.toHaveProperty('action');
    consumerSignals.dispose();
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const prehashed = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic',
      endpoint: 'https://collector.test/',
      eventSourceUrl: 'https://shop.test/checkout',
      userData: () => ({
        em: hash('sample@example.test'),
        ph: hash('12025550199'),
        external_id: hash('CustomerAbC'),
        fn: hash('alex'),
        ln: hash('rivera'),
        ct: hash('mumbai'),
        st: hash('mh'),
        zp: hash('400001'),
        country: hash('in'),
        db: hash('19900101'),
        ge: hash('f'),
        client_ip_address: '203.0.113.7',
        client_user_agent: 'Mozilla/5.0 (synthetic)',
      }),
      fetch: async (_url, init) => {
        payload = JSON.parse(init!.body as string);
        return Response.json({ events_received: 1 });
      },
    });
    await prehashed.send(event);
    expect(payload.data[0].user_data).toMatchObject({
      em: [hash('sample@example.test')],
      ph: [hash('12025550199')],
      external_id: [hash('CustomerAbC')],
      fn: [hash('alex')],
      country: [hash('in')],
      client_ip_address: '203.0.113.7',
      client_user_agent: 'Mozilla/5.0 (synthetic)',
    });
    expect(payload.data[0].user_data.external_id[0]).not.toBe(hash('customerabc'));

    const invalidMatching = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic',
      endpoint: 'https://collector.test/',
      eventSourceUrl: 'https://shop.test/checkout',
      userData: () => ({
        em: Array(11).fill('a'.repeat(64)),
        client_user_agent: 'Mozilla/5.0 (synthetic)',
      }),
    });
    await expect(invalidMatching.send(event)).rejects.toThrow('Invalid hashed');
  });
  it('rejects plaintext and matching fields outside the approved CAPI allowlist', async () => {
    for (const userData of [
      { em: 'raw@example.test' },
      { external_id: 'CustomerAbC' },
      { ph: '+12025550199' },
      { fn: 'Alex' },
      { country: 'IN' },
    ]) {
      const invalid = createMetaCapiProvider({
        pixelId: '123',
        accessToken: 'synthetic',
        endpoint: 'https://collector.test/',
        eventSourceUrl: 'https://shop.test/checkout',
        userData: () => ({ ...userData, client_user_agent: 'Mozilla/5.0 (synthetic)' }),
      });
      await expect(invalid.send(event)).rejects.toThrow('Invalid hashed matching data');
    }
    for (const userData of [{ em: 'a'.repeat(64) }, { phone: 'a'.repeat(64) }]) {
      const invalid = createMetaCapiProvider({
        pixelId: '123',
        accessToken: 'synthetic',
        endpoint: 'https://collector.test/',
        eventSourceUrl: 'https://shop.test/checkout',
        userData: () => userData,
      });
      await expect(invalid.send(event)).rejects.toThrow(
        'phone' in userData
          ? 'Unsupported matching data'
          : 'Website events require client_user_agent',
      );
    }
    for (const [userData, message] of [
      [{ client_user_agent: 'Mozilla/5.0' }, 'Matching data required'],
      [{ client_ip_address: 'not-an-ip', client_user_agent: 'Mozilla/5.0' }, 'Invalid client IP'],
      [{ em: 'a'.repeat(64), client_user_agent: 'bad\nagent' }, 'Invalid client user agent'],
    ] as const) {
      const invalid = createMetaCapiProvider({
        pixelId: '123',
        accessToken: 'synthetic',
        endpoint: 'https://collector.test/',
        eventSourceUrl: 'https://shop.test/checkout',
        userData: () => userData,
      });
      await expect(invalid.send(event)).rejects.toThrow(message);
    }
  });
  it('requires a web event source URL for website events', async () => {
    const options = {
      pixelId: '123',
      accessToken: 'synthetic',
      endpoint: 'https://collector.test/',
      userData: () => ({ em: 'a'.repeat(64), client_user_agent: 'Mozilla/5.0' }),
    };
    expect(() => createMetaCapiProvider({ ...options, eventSourceUrl: '' })).toThrow(
      'Invalid Meta configuration',
    );
    expect(() =>
      createMetaCapiProvider({ ...options, eventSourceUrl: 'javascript:alert(1)' }),
    ).toThrow('Invalid Meta configuration');
    let payload: any;
    const perRequest = createMetaCapiProvider({
      ...options,
      eventSourceUrl: () => 'https://shop.test/orders/thanks?token=secret',
      fetch: async (_url, init) => {
        payload = JSON.parse(init!.body as string);
        return Response.json({ events_received: 1 });
      },
    });
    await perRequest.send(event);
    expect(payload.data[0].event_source_url).toBe('https://shop.test/orders/thanks');
    const broken = createMetaCapiProvider({ ...options, eventSourceUrl: () => 'not a url' });
    await expect(broken.send(event)).rejects.toThrow('Invalid event source URL');
  });
  it('reads per-call context.meta before the option fallbacks', async () => {
    const bodies: any[] = [];
    const provider = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic',
      endpoint: 'https://collector.test/',
      eventSourceUrl: 'https://shop.test/fallback',
      userData: () => ({ em: 'f'.repeat(64), client_user_agent: 'Fallback/1.0' }),
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(init!.body as string));
        return Response.json({ events_received: 1 });
      },
    });
    await provider.send({
      ...event,
      context: {
        meta: {
          userData: {
            external_id: 'c'.repeat(64),
            client_ip_address: '203.0.113.9',
            client_user_agent: 'Context/2.0',
          },
          eventSourceUrl: 'https://shop.test/orders/thanks?token=secret',
        },
      },
    });
    expect(bodies[0].data[0]).toMatchObject({
      event_source_url: 'https://shop.test/orders/thanks',
      user_data: {
        external_id: ['c'.repeat(64)],
        client_ip_address: '203.0.113.9',
        client_user_agent: 'Context/2.0',
      },
    });
    // Context replaces, never merges with, the fallback matching data.
    expect(bodies[0].data[0].user_data).not.toHaveProperty('em');
    await provider.send(event);
    expect(bodies[1].data[0]).toMatchObject({
      event_source_url: 'https://shop.test/fallback',
      user_data: { em: ['f'.repeat(64)], client_user_agent: 'Fallback/1.0' },
    });
    await expect(
      provider.send({
        ...event,
        context: { meta: { userData: { em: 'raw@example.test', client_user_agent: 'A/1' } } },
      }),
    ).rejects.toThrow('Invalid hashed matching data');
    await expect(
      provider.send({
        ...event,
        consent: { analytics: true, marketing: false, observability: false },
      }),
    ).rejects.toThrow('Meta marketing consent denied');
    expect(bodies).toHaveLength(2);
  });
  it('works without an eventSourceUrl option when context supplies one', async () => {
    const bodies: any[] = [];
    const provider = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic',
      endpoint: 'https://collector.test/',
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(init!.body as string));
        return Response.json({ events_received: 1 });
      },
    });
    const userData = { em: 'a'.repeat(64), client_user_agent: 'Mozilla/5.0 (synthetic)' };
    await provider.send({
      ...event,
      context: { meta: { userData, eventSourceUrl: 'https://shop.test/checkout' } },
    });
    expect(bodies[0].data[0].event_source_url).toBe('https://shop.test/checkout');
    await expect(provider.send({ ...event, context: { meta: { userData } } })).rejects.toThrow(
      'Invalid event source URL',
    );
    expect(bodies).toHaveLength(1);
  });
  it('scopes concurrent server tracks to their own consent and context', async () => {
    const bodies: any[] = [];
    const gates: (() => void)[] = [];
    const signals = createServerSignals({
      consent: { analytics: false, marketing: false, observability: false },
      providers: [
        createMetaCapiProvider({
          pixelId: '123',
          accessToken: 'synthetic',
          endpoint: 'https://collector.test/',
          fetch: async (_url, init) => {
            bodies.push(JSON.parse(init!.body as string));
            if (bodies.length === 1) await new Promise<void>((resolve) => gates.push(resolve));
            else gates.splice(0).forEach((open) => open());
            return Response.json({ events_received: 1 });
          },
        }),
      ],
    });
    const granted = { analytics: false, marketing: true, observability: false };
    const shopper = (id: string, path: string) => ({
      meta: {
        userData: { external_id: id.repeat(64), client_user_agent: `Shopper-${id}/1.0` },
        eventSourceUrl: `https://shop.test/${path}`,
      },
    });
    const results = await Promise.all([
      signals.track(
        { ...event, eventId: 'order-a' },
        { consent: granted, context: shopper('a', 'a') },
      ),
      signals.track(
        { ...event, eventId: 'order-b' },
        { consent: granted, context: shopper('b', 'b') },
      ),
      signals.track({ ...event, eventId: 'order-c' }, { context: shopper('c', 'c') }),
    ]);
    expect(results.map((result) => result.outcomes[0]?.status)).toEqual(['sent', 'sent', 'denied']);
    const byId = Object.fromEntries(bodies.map((body) => [body.data[0].event_id, body.data[0]]));
    expect(Object.keys(byId).sort()).toEqual(['order-a', 'order-b']);
    for (const id of ['a', 'b']) {
      expect(byId[`order-${id}`]).toMatchObject({
        event_source_url: `https://shop.test/${id}`,
        user_data: { external_id: [id.repeat(64)], client_user_agent: `Shopper-${id}/1.0` },
      });
    }
    signals.dispose();
  });
  it('rejects unsuccessful acknowledgment', async () => {
    const provider = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic',
      endpoint: 'https://collector.test/',
      eventSourceUrl: 'https://shop.test/checkout',
      userData: () => ({ em: 'a'.repeat(64), client_user_agent: 'Mozilla/5.0 (synthetic)' }),
      fetch: async () => Response.json({ events_received: 0 }),
    });
    await expect(provider.send(event)).rejects.toThrow('did not accept');
  });
  it('excludes query parameters from eventSourceUrl', async () => {
    let payload: any;
    const provider = createMetaCapiProvider({
      pixelId: '123',
      accessToken: 'synthetic-token',
      endpoint: 'https://collector.test/',
      eventSourceUrl:
        'https://app.test/products/item-123?fbclid=test_fbclid_123&utm_extra=%2B919876543210&token=secret_to_strip',
      userData: () => ({ em: 'a'.repeat(64), client_user_agent: 'Mozilla/5.0 (synthetic)' }),
      fetch: async (_url, init) => {
        payload = JSON.parse(init!.body as string);
        return Response.json({ events_received: 1 });
      },
    });
    await provider.send(event);
    expect(payload.data[0].event_source_url).toBe('https://app.test/products/item-123');
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
      eventSourceUrl: 'https://shop.test/checkout',
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
  it('accepts non-JSON 200 OK responses without false error diagnosis', async () => {
    const errors: string[] = [];
    const observer = createOTLPObserver({
      endpoint: 'https://collector.test/v1/traces',
      serviceName: 'demo',
      onError: (e) => errors.push(e),
      fetch: async () => new Response('OK', { status: 200 }),
    });
    await observer.record(record);
    await observer.flush!();
    expect(errors).toHaveLength(0);
  });
  it('preserves nanosecond timestamp precision without precision loss', async () => {
    let payload: any;
    const observer = createOTLPObserver({
      endpoint: 'https://collector.test/v1/traces',
      serviceName: 'demo',
      fetch: async (_url, init) => {
        payload = JSON.parse(init!.body as string);
        return new Response('OK', { status: 200 });
      },
    });
    const highPrecisionRecord: RequestRecord & { startTime: number } = {
      ...record,
      startTime: 1730000000123,
      durationMs: 15,
    };
    await observer.record(highPrecisionRecord);
    await observer.flush!();
    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.startTimeUnixNano).toBe('1730000000123000000');
    // Notice that BigInt(Math.floor(1730000000123 * 1000000)) would have produced 1730000000122999808
    expect(span.startTimeUnixNano).not.toBe(String(BigInt(Math.floor(1730000000123 * 1000000))));
  });
});
describe('relative server fetch (1.1)', () => {
  it('handles relative fetch URLs without crashing and records telemetry', async () => {
    let recorded: RequestRecord | undefined;
    let fetchedUrl: any;
    const transport = vi.fn(async (input: any) => {
      fetchedUrl = input;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const signals = createServerSignals({
      consent: { analytics: true, marketing: true, observability: true },
      observer: {
        record: (rec) => {
          recorded = rec;
        },
      },
      fetch: transport,
    });
    const response = await signals.fetch('/api/cart');
    expect(response.status).toBe(200);
    expect(fetchedUrl).toBe('/api/cart');
    expect(recorded).toBeDefined();
    expect(recorded?.route).toBe('/api/cart');
    expect(recorded?.status).toBe(200);
  });
  it('propagates to relative URLs only with traceRelative, not magic traceOrigins values', async () => {
    const headers: (string | null)[] = [];
    const transport: typeof fetch = async (input, init) => {
      headers.push(
        new Headers(input instanceof Request ? input.headers : init?.headers).get('traceparent'),
      );
      return new Response('ok');
    };
    const denied = createServerSignals({
      consent,
      traceOrigins: ['', '/', 'relative'],
      fetch: transport,
    });
    await denied.fetch('/api/cart');
    expect(headers[0]).toBeNull();
    denied.dispose();

    const allowed = createServerSignals({ consent, traceRelative: true, fetch: transport });
    await allowed.fetch('/api/cart');
    await allowed.fetch('https://third-party.test/api');
    expect(headers[1]).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
    expect(headers[2]).toBeNull();
    allowed.dispose();
  });
});
