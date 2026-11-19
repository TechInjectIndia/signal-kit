// Fixture evidence only: every request goes to an injected fetch. Nothing here proves that GA4
// accepted, recorded, attributed or deduplicated an event; that needs DebugView.
import { describe, expect, it, vi } from 'vitest';
import { createGA4MeasurementProtocolProvider, createServerSignals } from '../src/index.js';
import type { GA4MeasurementProtocolOptions } from '../src/index.js';

const SECRET = 'synthetic-mp-secret-123';
const base = { measurementId: 'G-TEST123', apiSecret: SECRET } as const;
const allowed = { analytics: true, marketing: true, observability: false };
const denied = { analytics: false, marketing: false, observability: false };

type Captured = { url: URL; body: any };
function capture(response: () => Response = () => new Response(null, { status: 204 })) {
  const requests: Captured[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: new URL(String(input)), body: JSON.parse(String(init!.body)) });
    return response();
  });
  return { requests, fetch: fetch as unknown as typeof globalThis.fetch, spy: fetch };
}
function provider(options: Partial<GA4MeasurementProtocolOptions> = {}) {
  return createGA4MeasurementProtocolProvider({ ...base, ...options });
}
const purchase = (timestamp: number) => ({
  name: 'purchase' as const,
  eventId: 'order-1001-purchase',
  timestamp,
  properties: {
    transaction_id: 'ORD-1001',
    currency: 'INR',
    value: 1500,
    tax: 100,
    shipping: 50,
    items: [{ item_id: 'sku-1', item_name: 'Notebook', price: 750, quantity: 2 }],
  },
});
const ga4Context = { ga4: { clientId: '123456789.1700000000', sessionId: '1700000000' } };

describe('GA4 Measurement Protocol provider', () => {
  it('rejects invalid configuration without echoing the secret', () => {
    for (const options of [
      { ...base, measurementId: 'UA-1' },
      { ...base, apiSecret: '' },
      { ...base, endpoint: 'https://collector.test/mp/collect?api_secret=x' },
      { ...base, endpoint: 'ftp://collector.test/mp/collect' },
      { ...base, endpoint: 'https://collector.test/other', debug: true },
    ]) {
      let message = '';
      try {
        createGA4MeasurementProtocolProvider(options);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe('Invalid GA4 configuration');
    }
  });

  it('sends a purchase with client_id, session, timestamp and consent block', async () => {
    const { requests, fetch } = capture();
    const timestamp = Date.now() - 60 * 60 * 1000;
    const signals = createServerSignals({ consent: allowed, providers: [provider({ fetch })] });
    const result = await signals.track(purchase(timestamp), {
      context: { ...ga4Context, page: { location: 'https://shop.test/checkout?email=a@b.test' } },
    });
    expect(result.outcomes).toEqual([{ provider: 'ga4-mp', status: 'sent' }]);
    const [request] = requests;
    expect(request!.url.origin + request!.url.pathname).toBe(
      'https://www.google-analytics.com/mp/collect',
    );
    expect(request!.url.searchParams.get('measurement_id')).toBe('G-TEST123');
    expect(request!.url.searchParams.get('api_secret')).toBe(SECRET);
    expect(request!.body).toEqual({
      client_id: '123456789.1700000000',
      timestamp_micros: timestamp * 1000,
      consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
      events: [
        {
          name: 'purchase',
          params: {
            page_location: 'https://shop.test/checkout',
            transaction_id: 'ORD-1001',
            currency: 'INR',
            value: 1500,
            tax: 100,
            shipping: 50,
            items: [{ item_id: 'sku-1', item_name: 'Notebook', price: 750, quantity: 2 }],
            session_id: '1700000000',
            engagement_time_msec: 1,
          },
        },
      ],
    });
    expect(JSON.stringify(request!.body)).not.toContain(SECRET);
    signals.dispose();
  });

  it('omits timestamp_micros outside the 72 hour backdating window', async () => {
    const { requests, fetch } = capture();
    const ga4 = provider({ fetch, clientId: () => '1.2' });
    await ga4.send(purchase(Date.now() - 73 * 60 * 60 * 1000));
    await ga4.send(purchase(Date.now() + 60 * 60 * 1000));
    await ga4.send(purchase(Date.now() - 71 * 60 * 60 * 1000));
    expect(requests[0]!.body).not.toHaveProperty('timestamp_micros');
    expect(requests[1]!.body).not.toHaveProperty('timestamp_micros');
    expect(requests[2]!.body).toHaveProperty('timestamp_micros');
    // engagement_time_msec only accompanies a session_id.
    expect(requests[0]!.body.events[0].params).not.toHaveProperty('engagement_time_msec');
    expect(requests[0]!.body.events[0].params).not.toHaveProperty('session_id');
  });

  it('prefers per-call context over option callbacks and never invents a client_id', async () => {
    const { requests, fetch, spy } = capture();
    const ga4 = provider({
      fetch,
      clientId: () => 'fallback.client',
      sessionId: () => '42',
      userId: () => 'fallback-user',
    });
    await ga4.send({
      ...purchase(Date.now()),
      context: { ga4: { clientId: 'context.client', userId: 'customer-7' } },
    });
    expect(requests[0]!.body).toMatchObject({ client_id: 'context.client', user_id: 'customer-7' });
    expect(requests[0]!.body.events[0].params).toMatchObject({ session_id: '42' });
    await ga4.send(purchase(Date.now()));
    expect(requests[1]!.body).toMatchObject({
      client_id: 'fallback.client',
      user_id: 'fallback-user',
    });

    spy.mockClear();
    const missing = provider({ fetch });
    await expect(missing.send(purchase(Date.now()))).rejects.toThrow(
      'GA4 client_id missing or invalid',
    );
    const malformed = provider({ fetch, clientId: () => 'not a client id' });
    await expect(malformed.send(purchase(Date.now()))).rejects.toThrow(
      'GA4 client_id missing or invalid',
    );
    const throwing = provider({
      fetch,
      clientId: () => {
        throw new Error(`lookup failed ${SECRET}`);
      },
    });
    await expect(throwing.send(purchase(Date.now()))).rejects.toThrow(
      'GA4 client_id missing or invalid',
    );
    expect(spy).not.toHaveBeenCalled();

    const signals = createServerSignals({ consent: allowed, providers: [missing] });
    expect((await signals.track(purchase(Date.now()))).outcomes).toEqual([
      { provider: 'ga4-mp', status: 'failed', reason: 'provider_error' },
    ]);
    expect(spy).not.toHaveBeenCalled();
    signals.dispose();
  });

  it('delivers refund under its GA4 name', async () => {
    const { requests, fetch } = capture();
    const signals = createServerSignals({ consent: allowed, providers: [provider({ fetch })] });
    const result = await signals.track(
      {
        name: 'refund',
        eventId: 'order-1001-refund',
        properties: { transaction_id: 'ORD-1001', currency: 'INR', value: 500 },
      },
      { context: ga4Context },
    );
    expect(result.outcomes[0]?.status).toBe('sent');
    expect(requests[0]!.body.events[0]).toMatchObject({
      name: 'refund',
      params: { transaction_id: 'ORD-1001', currency: 'INR', value: 500 },
    });
    signals.dispose();
  });

  it('respects instance and per-call consent and maps Google Ads consent only when asked', async () => {
    const { requests, fetch, spy } = capture();
    const signals = createServerSignals({
      consent: denied,
      providers: [provider({ fetch, googleAdsConsent: 'marketing' })],
    });
    expect((await signals.track(purchase(Date.now()), { context: ga4Context })).outcomes).toEqual([
      { provider: 'ga4-mp', status: 'denied', reason: 'consent' },
    ]);
    expect(spy).not.toHaveBeenCalled();
    await signals.track(purchase(Date.now()), {
      consent: { analytics: true, marketing: false, observability: false },
      context: ga4Context,
    });
    await signals.track(purchase(Date.now()), {
      consent: { analytics: true, marketing: true, observability: false },
      context: ga4Context,
    });
    expect(requests.map((request) => request.body.consent)).toEqual([
      { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
      { ad_user_data: 'GRANTED', ad_personalization: 'GRANTED' },
    ]);
    signals.dispose();

    // A direct call carrying a denied snapshot is refused before the network.
    spy.mockClear();
    await expect(
      provider({ fetch }).send({ ...purchase(Date.now()), context: ga4Context, consent: denied }),
    ).rejects.toThrow('GA4 analytics consent denied');
    expect(spy).not.toHaveBeenCalled();
  });

  it('never surfaces the API secret from transport errors or outcomes', async () => {
    const leaky = vi.fn(async (input: RequestInfo | URL) => {
      throw new TypeError(`fetch failed for ${String(input)} (api_secret=${SECRET})`);
    }) as unknown as typeof globalThis.fetch;
    const ga4 = provider({ fetch: leaky, clientId: () => '1.2' });
    let thrown: unknown;
    try {
      await ga4.send(purchase(Date.now()));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const text = `${String(thrown)} ${(thrown as Error).stack ?? ''} ${JSON.stringify(thrown)}`;
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('api_secret');
    expect((thrown as Error).cause).toBeUndefined();

    const signals = createServerSignals({ consent: allowed, providers: [ga4] });
    const result = await signals.track(purchase(Date.now()));
    expect(result.outcomes).toEqual([
      { provider: 'ga4-mp', status: 'failed', reason: 'provider_error' },
    ]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    signals.dispose();

    const rejected = provider({
      clientId: () => '1.2',
      fetch: (async () => new Response('bad', { status: 400 })) as typeof globalThis.fetch,
    });
    await expect(rejected.send(purchase(Date.now()))).rejects.toThrow(
      'GA4 Measurement Protocol rejected event',
    );
  });

  it('targets the validation server in debug mode and fails on validation messages', async () => {
    const ok = capture(() => Response.json({ validationMessages: [] }));
    await provider({ fetch: ok.fetch, debug: true, clientId: () => '1.2' }).send(
      purchase(Date.now()),
    );
    expect(ok.requests[0]!.url.pathname).toBe('/debug/mp/collect');

    const eu = capture(() => Response.json({ validationMessages: [] }));
    await provider({
      fetch: eu.fetch,
      debug: true,
      endpoint: 'https://region1.google-analytics.com/mp/collect',
      clientId: () => '1.2',
    }).send(purchase(Date.now()));
    expect(eu.requests[0]!.url.host + eu.requests[0]!.url.pathname).toBe(
      'region1.google-analytics.com/debug/mp/collect',
    );

    const invalid = capture(() =>
      Response.json({
        validationMessages: [
          { fieldPath: 'events', description: 'bad', validationCode: 'VALUE_INVALID' },
        ],
      }),
    );
    await expect(
      provider({ fetch: invalid.fetch, debug: true, clientId: () => '1.2' }).send(
        purchase(Date.now()),
      ),
    ).rejects.toThrow('GA4 Measurement Protocol validation failed');
  });

  it('keeps per-call context and consent isolated across interleaved tracks', async () => {
    const requests: Captured[] = [];
    const gates: (() => void)[] = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), body: JSON.parse(String(init!.body)) });
      // Hold the first request until the second has been built.
      if (requests.length === 1) await new Promise<void>((resolve) => gates.push(resolve));
      else gates.splice(0).forEach((open) => open());
      return new Response(null, { status: 204 });
    }) as typeof globalThis.fetch;
    const signals = createServerSignals({
      consent: denied,
      providers: [provider({ fetch, googleAdsConsent: 'marketing' })],
    });
    const [first, second] = await Promise.all([
      signals.track(purchase(Date.now()), {
        consent: { analytics: true, marketing: true, observability: false },
        context: { ga4: { clientId: 'shopper.one', userId: 'customer-1' } },
      }),
      signals.track(purchase(Date.now()), {
        consent: { analytics: true, marketing: false, observability: false },
        context: { ga4: { clientId: 'shopper.two', sessionId: '22' } },
      }),
    ]);
    expect([first.outcomes[0]?.status, second.outcomes[0]?.status]).toEqual(['sent', 'sent']);
    const byClient = Object.fromEntries(requests.map((r) => [r.body.client_id, r.body]));
    expect(byClient['shopper.one']).toMatchObject({
      user_id: 'customer-1',
      consent: { ad_user_data: 'GRANTED' },
    });
    expect(byClient['shopper.one'].events[0].params).not.toHaveProperty('session_id');
    expect(byClient['shopper.two']).not.toHaveProperty('user_id');
    expect(byClient['shopper.two']).toMatchObject({ consent: { ad_user_data: 'DENIED' } });
    expect(byClient['shopper.two'].events[0].params).toMatchObject({ session_id: '22' });
    signals.dispose();
  });
});
