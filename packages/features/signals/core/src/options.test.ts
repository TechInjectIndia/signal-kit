import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSignals } from './index.js';
import type { Provider, SignalEvent, UserIdentity } from '@techinject/contracts';

const granted = { analytics: true, marketing: true, observability: true };
const denied = { analytics: false, marketing: false, observability: false };
const page = { name: 'page_view' as const, properties: { page_path: '/' } };
const removal = {
  name: 'remove_from_cart' as const,
  properties: { currency: 'USD', value: 10, items: [{ item_id: 'sku-1' }] },
};
// Synthetic, test-only match data and identifiers. Never real customer values.
const HASHED_EMAIL = 'a'.repeat(64);
const HASHED_PHONE = 'b'.repeat(64);
const USER_ID = 'host-user-7f3a';

function recorder(
  name: string,
  category: Provider['category'],
  eventFamily?: Provider['eventFamily'],
) {
  const received: SignalEvent[] = [];
  const provider: Provider = {
    name,
    category,
    ...(eventFamily ? { eventFamily } : {}),
    send(event) {
      received.push(event);
    },
  };
  return { provider, received };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('skipped outcomes', () => {
  it('skips a provider without a mapping, still sends the others, and counts skipped', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const meta = recorder('meta', 'marketing', 'meta');
    const signals = createSignals({ consent: granted, providers: [ga4.provider, meta.provider] });
    const result = await signals.track(removal);
    expect(result.outcomes).toEqual([
      { provider: 'ga4', status: 'sent' },
      { provider: 'meta', status: 'skipped', reason: 'event_mapping_missing' },
    ]);
    expect(ga4.received).toHaveLength(1);
    expect(meta.received).toHaveLength(0);
    expect(signals.getConnections()[1]).toMatchObject({
      attempts: 1,
      skipped: 1,
      invalid: 0,
      lastStatus: 'skipped',
    });
    signals.dispose();
  });
  it('routes to the requested categories only and reports the rest as not targeted', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const meta = recorder('meta', 'marketing', 'meta');
    const signals = createSignals({ consent: granted, providers: [ga4.provider, meta.provider] });
    const result = await signals.track(page, { categories: ['marketing'] });
    expect(result.outcomes).toEqual([
      { provider: 'ga4', status: 'skipped', reason: 'not_targeted' },
      { provider: 'meta', status: 'sent' },
    ]);
    expect(ga4.received).toHaveLength(0);
    expect(meta.received).toHaveLength(1);
    // Targeting never widens consent.
    signals.setConsent({ ...granted, marketing: false });
    expect(
      (await signals.track(page, { categories: ['marketing'] })).outcomes.map((o) => o.status),
    ).toEqual(['skipped', 'denied']);
    signals.dispose();
  });
  it('rejects malformed options as invalid without sending', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const signals = createSignals({ consent: granted, providers: [ga4.provider] });
    for (const options of [
      'marketing',
      { categories: 'marketing' },
      { categories: ['ads'] },
    ] as never[]) {
      expect((await signals.track(page, options)).outcomes).toEqual([
        { provider: 'ga4', status: 'invalid', reason: 'track_options' },
      ]);
    }
    expect(ga4.received).toHaveLength(0);
    signals.dispose();
  });
  it('routes to the named providers only and separates providers sharing a category', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const clarity = recorder('clarity', 'analytics', 'clarity');
    const meta = recorder('meta-pixel', 'marketing', 'meta');
    const signals = createSignals({
      consent: granted,
      providers: [ga4.provider, clarity.provider, meta.provider],
    });
    const result = await signals.track(page, { providers: ['clarity', 'meta-pixel'] });
    expect(result.outcomes).toEqual([
      { provider: 'ga4', status: 'skipped', reason: 'not_targeted' },
      { provider: 'clarity', status: 'sent' },
      { provider: 'meta-pixel', status: 'sent' },
    ]);
    expect(ga4.received).toHaveLength(0);
    expect(clarity.received).toHaveLength(1);
    expect(meta.received).toHaveLength(1);
    // Targeting by name never widens consent.
    signals.setConsent({ ...granted, analytics: false });
    expect((await signals.track(page, { providers: ['clarity', 'meta-pixel'] })).outcomes).toEqual([
      { provider: 'ga4', status: 'skipped', reason: 'not_targeted' },
      { provider: 'clarity', status: 'denied', reason: 'consent' },
      { provider: 'meta-pixel', status: 'sent' },
    ]);
    signals.dispose();
  });
  it('requires a provider to match both categories and names when both are given', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const clarity = recorder('clarity', 'analytics', 'clarity');
    const meta = recorder('meta-pixel', 'marketing', 'meta');
    const signals = createSignals({
      consent: granted,
      providers: [ga4.provider, clarity.provider, meta.provider],
    });
    const result = await signals.track(page, {
      categories: ['analytics'],
      providers: ['clarity', 'meta-pixel'],
    });
    expect(result.outcomes).toEqual([
      { provider: 'ga4', status: 'skipped', reason: 'not_targeted' },
      { provider: 'clarity', status: 'sent' },
      { provider: 'meta-pixel', status: 'skipped', reason: 'not_targeted' },
    ]);
    expect(meta.received).toHaveLength(0);
    signals.dispose();
  });
  it('skips every provider when no listed name matches', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const meta = recorder('meta-pixel', 'marketing', 'meta');
    const signals = createSignals({ consent: granted, providers: [ga4.provider, meta.provider] });
    for (const providers of [['tiktok'], []]) {
      expect((await signals.track(page, { providers })).outcomes).toEqual([
        { provider: 'ga4', status: 'skipped', reason: 'not_targeted' },
        { provider: 'meta-pixel', status: 'skipped', reason: 'not_targeted' },
      ]);
    }
    expect(ga4.received).toHaveLength(0);
    expect(meta.received).toHaveLength(0);
    signals.dispose();
  });
  it('rejects malformed provider names as invalid without sending', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const signals = createSignals({ consent: granted, providers: [ga4.provider] });
    for (const options of [
      { providers: 'ga4' },
      { providers: [''] },
      { providers: ['x'.repeat(65)] },
      { providers: [42] },
      { providers: [null] },
      { providers: Array.from({ length: 21 }, (_, index) => `p${index}`) },
      { providers: ['ga4'], categories: ['ads'] },
    ] as never[]) {
      expect((await signals.track(page, options)).outcomes).toEqual([
        { provider: 'ga4', status: 'invalid', reason: 'track_options' },
      ]);
    }
    expect(
      (await signals.track(page, { providers: ['x'.repeat(64)] })).outcomes.map((o) => o.status),
    ).toEqual(['skipped']);
    expect(ga4.received).toHaveLength(0);
    signals.dispose();
  });
});

describe('per-call context and consent', () => {
  it('gives each family only page plus its own slice, and no context without a family', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const meta = recorder('meta', 'marketing', 'meta');
    const plain = recorder('plain', 'analytics');
    const clarity = recorder('clarity', 'analytics', 'clarity');
    const signals = createSignals({
      consent: granted,
      providers: [ga4.provider, meta.provider, plain.provider, clarity.provider],
    });
    await signals.track(page, {
      context: {
        page: { location: 'https://example.invalid/shop' },
        ga4: { clientId: '123.456', sessionId: '789' },
        meta: { userData: { em: HASHED_EMAIL } },
        unknown: 'stripped',
      } as never,
    });
    expect(ga4.received[0]?.context).toEqual({
      page: { location: 'https://example.invalid/shop' },
      ga4: { clientId: '123.456', sessionId: '789' },
    });
    expect(meta.received[0]?.context).toEqual({
      page: { location: 'https://example.invalid/shop' },
      meta: { userData: { em: HASHED_EMAIL } },
    });
    expect(clarity.received[0]?.context).toEqual({
      page: { location: 'https://example.invalid/shop' },
    });
    expect(plain.received[0]).not.toHaveProperty('context');
    expect(ga4.received[0]?.consent).toEqual(granted);
    signals.dispose();
  });
  it('rejects a malformed context for the whole call without sending', async () => {
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const meta = recorder('meta', 'marketing', 'meta');
    const diagnostic = vi.fn();
    const signals = createSignals({
      consent: granted,
      onDiagnostic: diagnostic,
      providers: [ga4.provider, meta.provider],
    });
    const result = await signals.track(page, {
      context: { meta: { userData: { em: [HASHED_EMAIL, 42] } } } as never,
    });
    expect(result.outcomes).toEqual([
      { provider: 'ga4', status: 'invalid', reason: 'event_context' },
      { provider: 'meta', status: 'invalid', reason: 'event_context' },
    ]);
    expect(ga4.received).toHaveLength(0);
    expect(meta.received).toHaveLength(0);
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(HASHED_EMAIL);
    signals.dispose();
  });
  it('isolates interleaved calls with opposite per-call consent and different context', async () => {
    const gates = [deferred(), deferred()];
    const seen: { consent?: boolean; userData?: unknown }[] = [];
    let calls = 0;
    const meta: Provider = {
      name: 'meta',
      category: 'marketing',
      eventFamily: 'meta',
      async send(event) {
        const gate = gates[calls++]!;
        await gate.promise;
        seen.push({ consent: event.consent?.marketing, userData: event.context?.meta?.userData });
      },
    };
    const signals = createSignals({ consent: denied, providers: [meta] });
    const first = signals.track(page, {
      consent: { ...denied, marketing: true },
      context: { meta: { userData: { em: HASHED_EMAIL } } },
    });
    const second = signals.track(page, {
      consent: { ...denied, marketing: true },
      context: { meta: { userData: { ph: HASHED_PHONE } } },
    });
    const third = signals.track(page, {
      consent: denied,
      context: { meta: { userData: { em: 'c'.repeat(64) } } },
    });
    await Promise.resolve();
    // Resolve out of order so the calls interleave.
    gates[1]!.resolve();
    gates[0]!.resolve();
    const results = await Promise.all([first, second, third]);
    expect(results.map((result) => result.outcomes[0]?.status)).toEqual(['sent', 'sent', 'denied']);
    expect(seen).toEqual([
      { consent: true, userData: { ph: HASHED_PHONE } },
      { consent: true, userData: { em: HASHED_EMAIL } },
    ]);
    // Per-call consent never mutates instance consent.
    expect(signals.getConsent()).toEqual(denied);
    expect(signals.getConnections()[0]?.consent).toBe(false);
    expect((await signals.track(page)).outcomes[0]?.status).toBe('denied');
    signals.dispose();
  });
  it('aborts instance-consent sends on withdrawal but keeps per-call-consent sends', async () => {
    const abortSignals: AbortSignal[] = [];
    const finish = deferred();
    const provider: Provider = {
      name: 'slow',
      category: 'analytics',
      send(_event, signal) {
        abortSignals.push(signal!);
        return finish.promise;
      },
    };
    const signals = createSignals({ consent: granted, providers: [provider] });
    const viaInstance = signals.track(page);
    const viaCall = signals.track(page, { consent: granted });
    await Promise.resolve();
    signals.setConsent(denied);
    expect(abortSignals[0]?.aborted).toBe(true);
    expect(abortSignals[1]?.aborted).toBe(false);
    finish.resolve();
    expect((await viaInstance).outcomes[0]?.status).toBe('dropped');
    expect((await viaCall).outcomes[0]?.status).toBe('sent');
    // Dispose still aborts per-call-consent sends.
    const hanging: Provider = { ...provider, send: () => new Promise<void>(() => {}) };
    const late = createSignals({ consent: denied, providers: [hanging] });
    const lateCall = late.track(page, { consent: granted });
    await Promise.resolve();
    late.dispose();
    expect((await lateCall).outcomes[0]?.status).toBe('dropped');
    signals.dispose();
  });
});

describe('identity fan-out', () => {
  it('shares the identity only while each category is granted and clears it on reset and dispose', () => {
    const calls: Record<string, (UserIdentity | undefined)[]> = { ga4: [], meta: [] };
    const make = (name: 'ga4' | 'meta', category: Provider['category']): Provider => ({
      name,
      category,
      send() {},
      setUser(user) {
        calls[name]!.push(user);
      },
    });
    const broken: Provider = {
      name: 'broken',
      category: 'analytics',
      send() {},
      setUser() {
        throw new Error('private');
      },
    };
    const signals = createSignals({
      consent: { ...denied, analytics: true },
      providers: [broken, make('ga4', 'analytics'), make('meta', 'marketing')],
    });
    calls.ga4!.length = 0;
    calls.meta!.length = 0;
    signals.setUser({ id: USER_ID, customerType: 'registered', email: 'x' } as never);
    expect(calls.ga4).toEqual([{ id: USER_ID, customerType: 'registered' }]);
    expect(calls.meta).toEqual([undefined]);
    signals.setConsent(granted);
    expect(calls.meta!.at(-1)).toEqual({ id: USER_ID, customerType: 'registered' });
    signals.setConsent({ ...granted, analytics: false });
    expect(calls.ga4!.at(-1)).toBeUndefined();
    expect(calls.meta!.at(-1)).toEqual({ id: USER_ID, customerType: 'registered' });
    signals.resetUser();
    expect(calls.meta!.at(-1)).toBeUndefined();
    signals.setUser({ id: USER_ID });
    expect(calls.meta!.at(-1)).toEqual({ id: USER_ID });
    // An invalid identity is ignored and clears the previous one.
    signals.setUser({ id: 'person@example.invalid' });
    expect(calls.meta!.at(-1)).toBeUndefined();
    signals.setUser({ id: USER_ID });
    signals.dispose();
    expect(calls.meta!.at(-1)).toBeUndefined();
    expect(calls.ga4!.at(-1)).toBeUndefined();
    const before = calls.meta!.length;
    signals.setUser({ id: USER_ID });
    expect(calls.meta).toHaveLength(before);
  });
  it('never exposes identity or context in results, connections or warnings', async () => {
    vi.useFakeTimers();
    const diagnostics: unknown[] = [];
    const warnings: unknown[] = [];
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const meta = recorder('meta', 'marketing', 'meta');
    const signals = createSignals({
      consent: granted,
      debug: true,
      onDiagnostic: (result) => diagnostics.push(result),
      onWarning: (warning) => warnings.push(warning),
      providers: [ga4.provider, meta.provider],
    });
    signals.setUser({ id: USER_ID });
    const context = {
      page: { location: 'https://example.invalid/private-path' },
      ga4: { userId: USER_ID, clientId: '111.222' },
      meta: { userData: { em: HASHED_EMAIL, ph: [HASHED_PHONE] } },
    };
    const results = [
      await signals.track(page, { context }),
      await signals.track(page, { context }),
      await signals.track(removal, { context }),
      await signals.track(page, { context: { meta: { userData: { em: 5 } } } as never }),
    ];
    expect(warnings).toEqual([{ code: 'duplicate_event', name: 'page_view' }]);
    const exposed = JSON.stringify([results, diagnostics, warnings, signals.getConnections()]);
    for (const secret of [USER_ID, HASHED_EMAIL, HASHED_PHONE, 'private-path', '111.222'])
      expect(exposed).not.toContain(secret);
    signals.dispose();
  });
});

describe('duplicate warning', () => {
  it('warns only in debug, only without a caller event id, only within 1000 ms, and still sends', async () => {
    vi.useFakeTimers();
    const onWarning = vi.fn();
    const ga4 = recorder('ga4', 'analytics', 'ga4');
    const quiet = createSignals({ consent: granted, onWarning, providers: [ga4.provider] });
    await quiet.track(page);
    await quiet.track(page);
    expect(onWarning).not.toHaveBeenCalled();
    quiet.dispose();

    const signals = createSignals({
      consent: granted,
      debug: true,
      onWarning,
      providers: [ga4.provider],
    });
    ga4.received.length = 0;
    await signals.track(page);
    await signals.track({ ...page, eventId: 'caller-1' });
    expect(onWarning).not.toHaveBeenCalled();
    await signals.track({ ...page, properties: { page_path: '/other' } });
    expect(onWarning).not.toHaveBeenCalled();
    await signals.track(page);
    expect(onWarning).toHaveBeenCalledExactlyOnceWith({
      code: 'duplicate_event',
      name: 'page_view',
    });
    vi.advanceTimersByTime(1001);
    await signals.track(page);
    expect(onWarning).toHaveBeenCalledOnce();
    expect(ga4.received).toHaveLength(5);
    onWarning.mockImplementation(() => {
      throw new Error('host');
    });
    expect((await signals.track(page)).outcomes[0]?.status).toBe('sent');
    signals.dispose();
  });
});
