import { describe, expect, it } from 'vitest';
import {
  createSignals,
  createTraceContext,
  formatTraceparent,
  parseTraceparent,
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
  it('strips URL identities and rejects malformed contexts', () => {
    expect(safeRoute('https://example.invalid/orders/123?token=secret')).toBe('/orders/:id');
    expect(safeRoute('/orders/abc', '/orders/:orderId')).toBe('/orders/:orderId');
    expect(safeRoute('/users/customer%40example.invalid')).toBe('/users/:redacted');
    expect(parseTraceparent('00-' + '0'.repeat(32) + '-' + '1'.repeat(16) + '-01')).toBeUndefined();
    const context = createTraceContext();
    expect(parseTraceparent(formatTraceparent(context))).toEqual(context);
  });
});
