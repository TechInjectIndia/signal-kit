import { describe, expect, it, vi } from 'vitest';
import {
  createSignals,
  createTraceContext,
  formatTraceparent,
  parseTraceparent,
  safeProviderUrl,
  safeRoute,
} from './index.js';
const event = { name: 'page_view' as const, eventId: 'stable', properties: { page_path: '/' } };
describe('dispatch lifecycle', () => {
  it('rejects malformed runtime payloads with sanitized diagnostics even without providers', async () => {
    const signals = createSignals({ timeoutMs: Number.NaN, maxPending: Number.NaN });
    expect((await signals.track({ ...event, name: 'unknown' as never })).outcomes[0]?.status).toBe(
      'invalid',
    );
    expect((await signals.track({ ...event, properties: null as never })).outcomes[0]?.status).toBe(
      'invalid',
    );
    const invalidId = await signals.track({ ...event, eventId: 'customer@example.invalid' });
    expect(invalidId.outcomes[0]?.status).toBe('invalid');
    expect(invalidId.eventId).not.toContain('@');
    expect((await signals.track({ ...event, eventId: 123 as never })).outcomes[0]?.status).toBe(
      'invalid',
    );
    signals.setConsent(null as never);
    expect(signals.getConsent().analytics).toBe(false);
  });
  it('coerces initial runtime consent and notifies adapters before any dispatch', async () => {
    const observed: boolean[] = [];
    const signals = createSignals({
      consent: { analytics: 'yes' as never, marketing: false, observability: false },
      providers: [
        {
          name: 'a',
          category: 'analytics',
          send: () => {},
          setConsent: (consent) => observed.push(consent.analytics),
        },
      ],
    });
    expect(signals.getConsent().analytics).toBe(false);
    expect(observed).toEqual([false]);
    expect((await signals.track(event)).outcomes[0]?.status).toBe('denied');
  });
  it('defaults denied and never replays before consent', async () => {
    let calls = 0;
    const signals = createSignals({
      providers: [
        {
          name: 'a',
          category: 'analytics',
          send: () => {
            calls++;
          },
        },
      ],
    });
    expect((await signals.track(event)).outcomes[0]?.status).toBe('denied');
    signals.setConsent({ analytics: true, marketing: false, observability: false });
    expect(calls).toBe(0);
    expect((await signals.track(event)).eventId).toBe('stable');
    expect(calls).toBe(1);
  });
  it('keeps connection counts per instance even when legacy storage data exists', async () => {
    const getItem = vi
      .fn()
      .mockReturnValue(
        JSON.stringify([{ name: 'recorder', category: 'analytics', attempts: 999, sent: 999 }]),
      );
    const setItem = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem, setItem });
    const options = {
      persistKey: 'legacy-key',
      consent: { analytics: true, marketing: false, observability: false },
      providers: [{ name: 'recorder', category: 'analytics' as const, send: vi.fn() }],
    };
    try {
      const first = createSignals(options);
      expect(first.getConnections()[0]).toMatchObject({ attempts: 0, sent: 0 });
      await first.track(event);
      expect(first.getConnections()[0]).toMatchObject({ attempts: 1, sent: 1 });

      const second = createSignals(options);
      expect(second.getConnections()[0]).toMatchObject({ attempts: 0, sent: 0 });
      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      first.dispose();
      second.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('does not replay a denied provider copy or duplicate a sent copy after consent changes', async () => {
    const analyticsSend = vi.fn();
    const marketingSend = vi.fn();
    const options = {
      queueBeforeConsent: true,
      consent: { analytics: true, marketing: false, observability: false },
      providers: [
        { name: 'analytics', category: 'analytics' as const, send: analyticsSend },
        { name: 'marketing', category: 'marketing' as const, send: marketingSend },
      ],
    };
    const signals = createSignals(options);

    expect((await signals.track(event)).outcomes.map((outcome) => outcome.status)).toEqual([
      'sent',
      'denied',
    ]);
    expect(analyticsSend).toHaveBeenCalledOnce();
    expect(marketingSend).not.toHaveBeenCalled();

    signals.setConsent({ analytics: false, marketing: false, observability: false });
    signals.setConsent({ analytics: true, marketing: false, observability: false });
    signals.setConsent({ analytics: true, marketing: true, observability: false });
    await signals.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(analyticsSend).toHaveBeenCalledOnce();
    expect(marketingSend).not.toHaveBeenCalled();
    expect('replayConsentQueue' in signals).toBe(false);

    await signals.track({ ...event, eventId: 'new-event' });
    expect(analyticsSend).toHaveBeenCalledTimes(2);
    expect(marketingSend).toHaveBeenCalledOnce();
  });
  it('isolates failures, diagnostics and event mutation', async () => {
    const signals = createSignals({
      consent: { analytics: true, marketing: true, observability: false },
      onDiagnostic: () => {
        throw Error('private');
      },
      providers: [
        {
          name: 'broken',
          category: 'analytics',
          send: () => {
            throw Error('secret');
          },
        },
        {
          name: 'mutates',
          category: 'marketing',
          send: (value) => {
            value.properties.page_path = 'modified';
          },
        },
        {
          name: 'good',
          category: 'marketing',
          send: (value) => {
            expect(value.properties.page_path).toBe('/');
          },
        },
      ],
    });
    expect((await signals.track(event)).outcomes.map((o) => o.status)).toEqual([
      'failed',
      'sent',
      'sent',
    ]);
  });
  it('aborts withdrawal and bounds pending work even with uncooperative providers', async () => {
    let signal: AbortSignal | undefined;
    const signals = createSignals({
      maxPending: 1,
      timeoutMs: 20,
      consent: { analytics: true, marketing: false, observability: false },
      providers: [
        {
          name: 'slow',
          category: 'analytics',
          send: (_, supplied) => {
            signal = supplied;
            return new Promise(() => {});
          },
        },
      ],
    });
    const pending = signals.track(event);
    expect((await signals.track(event)).outcomes[0]?.status).toBe('dropped');
    await Promise.resolve();
    signals.setConsent({ analytics: false, marketing: false, observability: false });
    expect((await pending).outcomes[0]?.status).toBe('dropped');
    expect(signal?.aborted).toBe(true);
    await signals.flush();
  });
  it('completes hanging provider work at the deadline', async () => {
    const signals = createSignals({
      timeoutMs: 5,
      consent: { analytics: true, marketing: false, observability: false },
      providers: [{ name: 'slow', category: 'analytics', send: () => new Promise(() => {}) }],
    });
    expect((await signals.track(event)).outcomes[0]?.status).toBe('dropped');
  });
});
describe('telemetry context', () => {
  it('removes query strings, fragments and URL credentials from provider URLs', () => {
    expect(
      safeProviderUrl(
        'https://user:secret@example.invalid/orders/123?utm_source=google&utm_private=%2B919876543210&token=secret#details',
      ),
    ).toBe('https://example.invalid/orders/:id');
    expect(safeProviderUrl('https://example.invalid/?gclid=click-id&fbclid=click-id')).toBe(
      'https://example.invalid/',
    );
  });
  it('strips URL identities and rejects malformed contexts', () => {
    expect(safeRoute('https://example.invalid/orders/123?token=secret')).toBe('/orders/:id');
    expect(safeRoute('/orders/abc', '/orders/:orderId')).toBe('/orders/:orderId');
    expect(safeRoute('/users/customer%40example.invalid')).toBe('/users/:redacted');
    // Alphanumeric ID redaction (4.1)
    expect(safeRoute('/users/507f1f77bcf86cd799439011')).toBe('/users/:id'); // MongoDB ObjectID
    expect(safeRoute('/orders/cs_test_a1b2c3d4e5f6g7h8')).toBe('/orders/:id'); // Stripe ID
    expect(safeRoute('/orders/ORD-98721')).toBe('/orders/:id'); // Order ID
    expect(safeRoute('/posts/c123456789012345678901234')).toBe('/posts/:id'); // CUID
    // Route groups stripping (4.2)
    expect(safeRoute('/(marketing)/about')).toBe('/about');
    expect(safeRoute('/(app)/dashboard/stats')).toBe('/dashboard/stats');
    expect(safeRoute('/(auth)/login')).toBe('/login');

    expect(parseTraceparent('00-' + '0'.repeat(32) + '-' + '1'.repeat(16) + '-01')).toBeUndefined();
    const context = createTraceContext();
    expect(parseTraceparent(formatTraceparent(context))).toEqual(context);
  });
});
