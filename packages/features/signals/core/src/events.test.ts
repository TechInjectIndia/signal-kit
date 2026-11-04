import { describe, expect, it, vi } from 'vitest';
import { createSignals, defineEvent } from './index.js';
import { exampleEvents, z } from '../../contracts/test/consumer-events.js';
import type { EventDefinition, Provider, SignalEvent } from '@techinject/contracts';

const consent = { analytics: true, marketing: true, observability: true };
describe('instance event registry', () => {
  it('strips nested unknowns and gives each provider the same identity and its own projection', async () => {
    const definition = defineEvent({
      name: 'tutorial_open',
      schema: z.object({ details: z.object({ topic: z.string() }) }),
      map: {
        ga4: { name: 'tutorial_open', properties: { details: 'details' } },
        meta: { name: 'tutorial_open', mode: 'custom', properties: { details: 'details' } },
        clarity: { name: 'tutorial_open' },
      },
    });
    const received: SignalEvent[] = [];
    const providers: Provider[] = (['ga4', 'meta', 'clarity'] as const).map((family) => ({
      name: family,
      eventFamily: family,
      category: 'analytics',
      send(event) {
        received.push(structuredClone(event));
        event.properties.details = 'mutated';
      },
    }));
    const signals = createSignals({ events: [definition], providers, consent });
    await signals.track({
      name: 'tutorial_open',
      eventId: 'shared',
      timestamp: 1234,
      properties: {
        details: { topic: 'intro', unknown: 'sample@example.invalid' },
        unknown: 'sample@example.invalid',
      } as { details: { topic: string } },
    });
    expect(received).toHaveLength(3);
    for (const event of received) {
      expect(event.eventId).toBe('shared');
      expect(event.timestamp).toBe(1234);
      expect(event.properties).toEqual({ details: { topic: 'intro' } });
      expect(event.providerEvent?.name).toBe('tutorial_open');
    }
    expect(received[2]?.providerEvent?.properties).toEqual({});
    signals.dispose();
  });
  it('applies consent without replay and reports missing maps while continuing other providers', async () => {
    const send = vi.fn();
    const definition = defineEvent({
      name: 'help_open',
      schema: z.object({ section: z.string() }),
      map: { ga4: { name: 'help_open', properties: { section: 'section' } } },
    });
    const signals = createSignals({
      events: [definition],
      providers: [
        { name: 'analytics', eventFamily: 'ga4', category: 'analytics', send },
        { name: 'marketing', eventFamily: 'meta', category: 'marketing', send },
      ],
    });
    expect(
      (await signals.track({ name: 'help_open', properties: { section: 'intro' } })).outcomes.map(
        (entry) => entry.status,
      ),
    ).toEqual(['denied', 'denied']);
    signals.setConsent(consent);
    expect(send).not.toHaveBeenCalled();
    expect(
      (await signals.track({ name: 'help_open', properties: { section: 'intro' } })).outcomes,
    ).toEqual([
      { provider: 'analytics', status: 'sent' },
      { provider: 'marketing', status: 'invalid', reason: 'event_mapping_missing' },
    ]);
    expect(send).toHaveBeenCalledOnce();
    signals.dispose();
  });
  it('rejects nested and encoded PII before every provider and keeps diagnostics value-free', async () => {
    const send = vi.fn();
    const diagnostic = vi.fn();
    const definition = defineEvent({
      name: 'help_open',
      schema: z.object({ details: z.object({ label: z.string() }) }),
      map: {},
    });
    const signals = createSignals({
      events: [definition],
      consent,
      onDiagnostic: diagnostic,
      providers: [{ name: 'local', category: 'analytics', send }],
    });
    for (const label of ['sample%40example.invalid', '+1 (202) 555-0199']) {
      expect(
        (await signals.track({ name: 'help_open', properties: { details: { label } } })).outcomes[0]
          ?.status,
      ).toBe('invalid');
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(label);
    }
    expect(send).not.toHaveBeenCalled();
    signals.dispose();
  });
  it('rejects overrides, collisions, unsafe schema types and forbidden projections', () => {
    expect(() => createSignals({ events: [exampleEvents[0], exampleEvents[0]] })).toThrow(
      'Duplicate',
    );
    expect(() => defineEvent({ name: 'purchase', schema: z.object({}), map: {} })).toThrow(
      'reserved',
    );
    for (const schema of [
      z.looseObject({ label: z.string() }),
      z.object({ data: z.record(z.string(), z.string()) }),
      z.object({ value: z.transform(() => 'unchecked') }),
    ]) {
      expect(() => defineEvent({ name: 'test_event', schema, map: {} })).toThrow();
    }
    expect(() =>
      defineEvent({ name: 'test_event', schema: z.object({ phone_number: z.string() }), map: {} }),
    ).toThrow();
    expect(() =>
      defineEvent({
        name: 'test_event',
        schema: z.object({ label: z.string() }),
        map: {
          ga4: { name: 'test_event', properties: { event_id: 'label' } },
        },
      }),
    ).toThrow('projection');
  });
  it('guards dynamic names per provider without turning consumer actions into predefined conversions', async () => {
    const send = vi.fn();
    const signals = createSignals({
      events: exampleEvents,
      consent,
      providers: [
        { name: 'ga4', eventFamily: 'ga4', category: 'analytics', send },
        { name: 'meta', eventFamily: 'meta', category: 'marketing', send },
      ],
    });
    for (const action of ['purchase', 'video-play', 'CustomEvent']) {
      const result = await signals.track({ name: 'custom_event', properties: { action } });
      expect(result.outcomes.every((entry) => entry.status === 'invalid')).toBe(true);
    }
    expect(send).not.toHaveBeenCalled();
    await signals.track({
      name: 'custom_event',
      eventId: 'custom-1',
      properties: { action: 'video_play', label: 'intro' },
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0].providerEvent).toMatchObject({
      name: 'video_play',
      properties: { label: 'intro' },
    });
    signals.dispose();
  });
  it('snapshots root registration and keeps consumer definitions out of other instances', async () => {
    const definition = defineEvent({
      name: 'help_open',
      schema: z.object({ section: z.string() }),
      map: {},
    });
    const definitions: EventDefinition[] = [definition];
    const send = vi.fn();
    const signals = createSignals({
      events: definitions,
      consent,
      providers: [{ name: 'local', category: 'analytics', send }],
    });
    definitions.length = 0;
    const schema = definition.schema as unknown as { _zod: { def: { shape: object } } };
    Reflect.set(schema._zod.def.shape, 'section', z.number());
    expect(
      (await signals.track({ name: 'help_open', properties: { section: 'intro' } })).outcomes[0]
        ?.status,
    ).toBe('sent');
    expect(send.mock.calls[0]?.[0].properties).toEqual({ section: 'intro' });
    expect(
      (await createSignals().track({ name: 'help_open', properties: {} } as never)).outcomes[0]
        ?.status,
    ).toBe('invalid');
    signals.dispose();
  });
  it('aborts a consumer dispatch on withdrawal and does not replay it after regrant', async () => {
    const definition = defineEvent({ name: 'help_open', schema: z.object({}), map: {} });
    const send = vi.fn(
      (_event: SignalEvent, signal?: AbortSignal) =>
        new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        }),
    );
    const signals = createSignals({
      events: [definition],
      consent,
      providers: [{ name: 'local', category: 'analytics', send }],
    });
    const pending = signals.track({ name: 'help_open', properties: {} });
    await Promise.resolve();
    signals.setConsent({ ...consent, analytics: false });
    expect((await pending).outcomes[0]?.status).toBe('dropped');
    signals.setConsent(consent);
    await signals.flush();
    expect(send).toHaveBeenCalledOnce();
    signals.dispose();
  });
});
