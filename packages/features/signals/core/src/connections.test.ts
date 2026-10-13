import { describe, expect, it } from 'vitest';
import { createSignals } from './index.js';

describe('connection status', () => {
  it('notifies the final dropped outcome when disposed during a send', async () => {
    let started!: () => void;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    const signals = createSignals({
      consent: { analytics: true, marketing: false, observability: false },
      providers: [
        {
          name: 'pending',
          category: 'analytics',
          send() {
            started();
            return new Promise(() => {});
          },
        },
      ],
    });
    let last = signals.getConnections();
    signals.subscribeConnections(() => {
      last = signals.getConnections();
    });
    const operation = signals.track({ name: 'page_view', properties: { page_path: '/' } });
    await sending;
    signals.dispose();
    await operation;
    await signals.flush();
    expect(last[0]).toMatchObject({ disposed: true, dropped: 1, attempts: 1 });
    const previous = last;
    await signals.track({ name: 'page_view', properties: { page_path: '/' } });
    expect(last).toBe(previous);
  });
  it('reports actual outcomes, consent and disposal without retaining identities', async () => {
    const signals = createSignals({
      providers: [
        { name: 'working', category: 'analytics', send() {} },
        {
          name: 'broken',
          category: 'analytics',
          send() {
            throw new Error('secret');
          },
        },
      ],
    });
    let updates = 0;
    const unsubscribe = signals.subscribeConnections(() => {
      updates++;
    });
    signals.subscribeConnections(() => {
      throw new Error('UI failure');
    });
    const event = {
      name: 'page_view' as const,
      eventId: 'private-id',
      properties: { page_path: '/' },
    };
    await signals.track(event);
    expect(signals.getConnections().map((c) => c.lastStatus)).toEqual(['denied', 'denied']);
    signals.setConsent({ analytics: true, marketing: false, observability: false });
    await signals.track(event);
    const snapshot = signals.getConnections();
    expect(snapshot[0]).toMatchObject({
      consent: true,
      attempts: 2,
      sent: 1,
      denied: 1,
      lastStatus: 'sent',
    });
    expect(snapshot[1]).toMatchObject({ failed: 1, lastStatus: 'failed' });
    expect(JSON.stringify(snapshot)).not.toMatch(/private-id|secret|page_path/);
    snapshot[0]!.sent = 99;
    expect(signals.getConnections()[0]!.sent).toBe(1);
    unsubscribe();
    signals.dispose();
    expect(signals.getConnections()[0]!.disposed).toBe(true);
    expect(updates).toBe(3);
  });
  it('keeps duplicate names independent and reports invalid and timeout outcomes', async () => {
    const signals = createSignals({
      timeoutMs: 5,
      consent: { analytics: true, marketing: false, observability: false },
      providers: [
        { name: 'same', category: 'analytics', send() {} },
        { name: 'same', category: 'marketing', send() {} },
        { name: 'timeout', category: 'analytics', send: () => new Promise(() => {}) },
      ],
    });
    await signals.track({ name: 'page_view', properties: { page_path: '/' } });
    expect(signals.getConnections().map((c) => c.lastStatus)).toEqual([
      'sent',
      'denied',
      'dropped',
    ]);
    await signals.track({ name: 'page_view', properties: { page_path: '//invalid' } });
    expect(signals.getConnections().map((c) => c.invalid)).toEqual([1, 1, 1]);
    expect(createSignals().getConnections()).toEqual([]);
    signals.dispose();
  });
});
