import { test, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createSvelteKitHooks } from './index.js';
test('route templates, outbound correlation, host fetch and isolated per-request consent', async () => {
  const records: { route: string; traceId?: string; spanKind?: number }[] = [];
  const hooks = createSvelteKitHooks((event) => ({
    consent: {
      analytics: false,
      marketing: false,
      observability: event.url.searchParams.has('allow'),
    },
    observer: {
      record(record) {
        records.push(record);
      },
    },
    traceOrigins: ['https://inventory.example'],
  }));
  const event = {
    request: new Request('https://shop.example/orders/private?allow=1'),
    url: new URL('https://shop.example/orders/private?allow=1'),
    route: { id: '/orders/[id]' },
  } as RequestEvent;
  let wire: string | null = null;
  const hostFetch = async (input: RequestInfo | URL) => {
    wire = new Request(input).headers.get('traceparent');
    return new Response('host fetch');
  };
  const response = await hooks.handle({
    event,
    resolve: async () => {
      const outbound = await hooks.handleFetch({
        event,
        request: new Request('https://inventory.example/stock'),
        fetch: hostFetch as typeof fetch,
      });
      expect(await outbound.text()).toBe('host fetch');
      return new Response('unchanged', { status: 201 });
    },
  });
  expect(response.status).toBe(201);
  expect(await response.text()).toBe('unchanged');
  expect(records.map((r) => r.route)).toEqual(['/stock', '/orders/[id]']);
  expect(records[0]?.traceId).toBe(records[1]?.traceId);
  expect(wire).toContain(records[0]?.traceId);
  const denied = { ...event, url: new URL('https://shop.example/orders/private') } as RequestEvent;
  await hooks.handle({ event: denied, resolve: async () => new Response('ok') });
  expect(records).toHaveLength(2);
});
test('exceptions propagate and telemetry failure does not replace the host error', async () => {
  const error = new Error('host');
  const records: { status: number }[] = [];
  const hooks = createSvelteKitHooks(() => ({
    consent: { analytics: false, marketing: false, observability: true },
    observer: {
      record(record) {
        records.push(record);
        throw new Error('observer');
      },
    },
  }));
  const event = {
    request: new Request('https://shop.example/api'),
    route: { id: '/api' },
  } as RequestEvent;
  await expect(
    hooks.handle({
      event,
      resolve: async () => {
        throw error;
      },
    }),
  ).rejects.toBe(error);
  expect(records[0]?.status).toBe(0);
});

test('a hung observer flush cannot hold the host response', async () => {
  const hooks = createSvelteKitHooks(() => ({
    timeoutMs: 10,
    consent: { analytics: false, marketing: false, observability: true },
    observer: { record() {}, flush: () => new Promise<void>(() => {}) },
  }));
  const event = {
    request: new Request('https://shop.example/api'),
    route: { id: '/api' },
  } as RequestEvent;
  const response = await hooks.handle({
    event,
    resolve: async () => new Response('host response'),
  });
  expect(await response.text()).toBe('host response');
}, 1000);

test('concurrent requests keep consent and trace state isolated', async () => {
  const records: { traceId?: string }[] = [];
  const hooks = createSvelteKitHooks((event) => ({
    consent: {
      analytics: false,
      marketing: false,
      observability: event.url.pathname === '/allowed',
    },
    observer: {
      record(record) {
        records.push(record);
      },
    },
    traceOrigins: ['https://inventory.example'],
  }));
  const run = (path: string, traceId: string, delay: number) => {
    const request = new Request(`https://shop.example/${path}`, {
      headers: { traceparent: `00-${traceId}-bbbbbbbbbbbbbbbb-01` },
    });
    const event = { request, url: new URL(request.url), route: { id: `/${path}` } } as RequestEvent;
    return hooks.handle({
      event,
      resolve: async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return hooks.handleFetch({
          event,
          request: new Request('https://inventory.example/stock'),
          fetch: async () => new Response('ok'),
        });
      },
    });
  };
  await Promise.all([
    run('allowed', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5),
    run('denied', 'cccccccccccccccccccccccccccccccc', 1),
  ]);
  expect(records).toHaveLength(2);
  expect(records.every((r) => r.traceId === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
});

test.each([false, true])(
  'configuration failure skips telemetry and preserves the host response (async=%s)',
  async (asyncFailure) => {
    const policyError = new Error('private config error');
    const hooks = createSvelteKitHooks(() => {
      if (asyncFailure) return Promise.reject(policyError);
      throw policyError;
    });
    const event = {
      request: new Request('https://shop.example/api'),
      route: { id: '/api' },
    } as RequestEvent;
    const response = await hooks.handle({
      event,
      resolve: async () => new Response('host still works'),
    });
    expect(await response.text()).toBe('host still works');
    const hostError = new Error('host exception');
    await expect(
      hooks.handle({
        event,
        resolve: async () => {
          throw hostError;
        },
      }),
    ).rejects.toBe(hostError);
  },
);

test('handles a synthetic request event with a null route ID', async () => {
  const records: { route: string }[] = [];
  const hooks = createSvelteKitHooks(() => ({
    consent: { analytics: false, marketing: false, observability: true },
    observer: {
      record(record) {
        records.push(record);
      },
    },
  }));
  const eventWithNullRoute = {
    request: new Request('https://shop.example/api/v2/lead'),
    url: new URL('https://shop.example/api/v2/lead'),
    route: { id: null },
  } as unknown as RequestEvent;
  const res = await hooks.handle({
    event: eventWithNullRoute,
    resolve: async () => new Response('ok'),
  });
  expect(await res.text()).toBe('ok');
  expect(records[0]?.route).toBe('/api/v2/lead');
});
