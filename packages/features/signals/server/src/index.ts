import { AsyncLocalStorage } from 'node:async_hooks';
import { createSignals, safeRoute } from '@signalkit/core';
import type { Consent, Observer, RequestRecord, SignalEvent, Provider } from '@signalkit/contracts';

export type ServerConfig = Parameters<typeof createSignals>[0] & {
  observer?: Observer;
  traceOrigins?: string[];
  excludeUrls?: string[];
  fetch?: typeof globalThis.fetch;
};
type Trace = { traceId: string; spanId: string; flags: string; parentSpanId?: string };
const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
function trace(header: string | null): Trace {
  const match = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/.exec(header ?? '');
  return match && !/^0+$/.test(match[1]!) && !/^0+$/.test(match[2]!)
    ? { traceId: match[1]!, parentSpanId: match[2]!, spanId: randomHex(8), flags: match[3]! }
    : { traceId: randomHex(16), spanId: randomHex(8), flags: '01' };
}
export function createServerSignals(config: ServerConfig = {}) {
  const signals = createSignals(config);
  const context = new AsyncLocalStorage<Trace>();
  const transport = config.fetch ?? globalThis.fetch;
  let disposed = false;
  const observations = new Set<Promise<void>>();
  const maxObservations = Number.isFinite(config.maxPending)
    ? Math.max(1, Math.min(100, Math.floor(config.maxPending!)))
    : 20;
  const observationTimeout = Number.isFinite(config.timeoutMs)
    ? Math.max(1, Math.min(30_000, config.timeoutMs!))
    : 2000;
  try {
    config.observer?.setConsent?.(signals.getConsent());
  } catch {
    /* isolated */
  }
  const excluded = (url: string) => (config.excludeUrls ?? []).some((value) => url.includes(value));
  const observe = (record: RequestRecord) => {
    if (disposed || !signals.getConsent().observability || observations.size >= maxObservations)
      return;
    // Bound even a custom observer that never settles; it cannot delay host responses.
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, observationTimeout);
    });
    let delivery: Promise<void>;
    try {
      delivery = Promise.resolve(config.observer?.record(record)).catch(() => undefined);
    } catch {
      delivery = Promise.resolve();
    }
    const pending = Promise.race([delivery, deadline]).finally(() => {
      clearTimeout(timer!);
      observations.delete(pending);
    });
    observations.add(pending);
  };
  const instrumentedFetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (disposed || !signals.getConsent().observability || excluded(url))
      return transport(input, init);
    const request = new Request(input, init);
    const parent = context.getStore();
    const span = parent
      ? { ...parent, parentSpanId: parent.spanId, spanId: randomHex(8) }
      : trace(null);
    const headers = new Headers(request.headers);
    if (
      (config.traceOrigins ?? []).includes(new URL(request.url).origin) &&
      !headers.has('traceparent')
    ) {
      headers.set('traceparent', `00-${span.traceId}-${span.spanId}-${span.flags}`);
    }
    const start = performance.now();
    const startTime = Date.now();
    let status = 0;
    try {
      const response = await transport(new Request(request, { headers }));
      status = response.status;
      return response;
    } finally {
      observe({
        kind: 'request',
        route: safeRoute(request.url),
        method: request.method,
        status,
        durationMs: performance.now() - start,
        ...span,
        error: status === 0 || status >= 400,
        ...{ startTime, spanKind: 3 },
      });
    }
  };
  return {
    ...signals,
    fetch: instrumentedFetch,
    setConsent(consent: Consent) {
      signals.setConsent(consent);
      try {
        config.observer?.setConsent?.(signals.getConsent());
      } catch {
        /* isolated */
      }
    },
    async handle(
      request: Request,
      handler: (request: Request) => Response | Promise<Response>,
      options: { route?: string } = {},
    ): Promise<Response> {
      if (disposed || !signals.getConsent().observability || excluded(request.url))
        return handler(request);
      const span = trace(request.headers.get('traceparent'));
      const start = performance.now();
      const startTime = Date.now();
      return context.run(span, async () => {
        let status = 0;
        try {
          const response = await handler(request);
          status = response.status;
          return response;
        } finally {
          observe({
            kind: 'request',
            route: safeRoute(request.url, options.route),
            method: request.method,
            status,
            durationMs: performance.now() - start,
            ...span,
            error: status === 0 || status >= 400,
            ...{ startTime, spanKind: 2 },
          });
        }
      });
    },
    async flush() {
      await signals.flush();
      await Promise.all([...observations]);
      try {
        await config.observer?.flush?.();
      } catch {
        /* isolated */
      }
    },
    dispose() {
      disposed = true;
      signals.dispose();
      try {
        config.observer?.dispose?.();
      } catch {
        /* isolated */
      }
    },
  };
}
export type ServerSignals = ReturnType<typeof createServerSignals>;

const metaNames: Record<SignalEvent['name'], string> = {
  page_view: 'PageView',
  product_view: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
};
export interface MetaCapiOptions {
  pixelId: string;
  accessToken: string;
  /** Require an explicit supported Graph API version; never silently use latest. */
  apiVersion?: string;
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  testEventCode?: string;
  /** Only SHA-256 hashed em/ph/external_id and validated fbp/fbc are accepted. */
  userData?: () => Record<string, string | string[]>;
  eventSourceUrl?: string;
}
function safeUserData(input: Record<string, string | string[]>): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of ['em', 'ph', 'external_id']) {
    const raw = input[key];
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length > 10 || !values.every((value) => /^[a-f0-9]{64}$/i.test(value)))
      throw new Error('Invalid hashed matching data');
    result[key] = values;
  }
  for (const key of ['fbp', 'fbc']) {
    const value = input[key];
    if (value !== undefined) {
      if (
        typeof value !== 'string' ||
        value.length > 256 ||
        !/^fb\.\d+\.\d+\.[A-Za-z0-9_-]+$/.test(value)
      )
        throw new Error('Invalid matching cookie');
      result[key] = value;
    }
  }
  if (Object.keys(input).some((key) => !['em', 'ph', 'external_id', 'fbp', 'fbc'].includes(key)))
    throw new Error('Unsupported matching data');
  if (Object.keys(result).length === 0) throw new Error('Matching data required');
  return result;
}
export function createMetaCapiProvider(options: MetaCapiOptions): Provider {
  if (!/^\d+$/.test(options.pixelId) || !options.accessToken)
    throw new Error('Invalid Meta configuration');
  if (!options.endpoint && !/^v\d+\.\d+$/.test(options.apiVersion ?? ''))
    throw new Error('Explicit Graph API version required');
  const endpoint =
    options.endpoint ??
    `https://graph.facebook.com/${options.apiVersion}/${options.pixelId}/events`;
  const transport = options.fetch ?? globalThis.fetch;
  const source = options.eventSourceUrl ? new URL(options.eventSourceUrl) : undefined;
  if (source) {
    source.pathname = safeRoute(source);
    source.search = '';
    source.hash = '';
    source.username = '';
    source.password = '';
  }
  return {
    name: 'meta-capi',
    category: 'marketing',
    async send(event, signal) {
      const data = safeUserData(options.userData?.() ?? {});
      const items = event.properties.items as
        | Array<{ item_id?: string; quantity?: number; price?: number }>
        | undefined;
      const customData = {
        currency: event.properties.currency,
        value: event.properties.value,
        order_id: event.properties.transaction_id,
        content_type: 'product',
        content_ids: items?.map((item) => item.item_id).filter(Boolean),
        contents: items?.map((item) => ({
          id: item.item_id,
          quantity: item.quantity ?? 1,
          item_price: item.price,
        })),
      };
      const response = await transport(endpoint, {
        method: 'POST',
        signal: signal ?? null,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: options.accessToken,
          test_event_code: options.testEventCode,
          data: [
            {
              event_name: metaNames[event.name],
              event_time: Math.floor(event.timestamp / 1000),
              event_id: event.eventId,
              action_source: 'website',
              event_source_url: source?.href,
              user_data: data,
              custom_data: customData,
            },
          ],
        }),
      });
      if (!response.ok) throw new Error('Meta transport rejected event');
      const payload = (await response.json()) as { events_received?: number; error?: unknown };
      if (payload.error || payload.events_received !== 1)
        throw new Error('Meta did not accept event');
    },
  };
}

export interface OTLPOptions {
  endpoint: string;
  serviceName: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
  maxPending?: number;
  timeoutMs?: number;
  onError?: (reason: 'capacity' | 'transport' | 'timeout') => void;
}
export function createOTLPObserver(options: OTLPOptions): Observer {
  const transport = options.fetch ?? globalThis.fetch;
  const pending = new Set<Promise<void>>();
  const controllers = new Set<AbortController>();
  const max = Number.isFinite(options.maxPending)
    ? Math.max(1, Math.min(100, Math.floor(options.maxPending!)))
    : 20;
  const timeout = Number.isFinite(options.timeoutMs)
    ? Math.max(10, Math.min(30_000, options.timeoutMs!))
    : 2000;
  let disposed = false;
  let allowed = true;
  const diagnostic = (reason: 'capacity' | 'transport' | 'timeout') => {
    try {
      options.onError?.(reason);
    } catch {
      /* isolated */
    }
  };
  return {
    record(record) {
      if (disposed || !allowed) return;
      if (pending.size >= max) {
        diagnostic('capacity');
        return;
      }
      const controller = new AbortController();
      controllers.add(controller);
      const data = record as RequestRecord & { startTime?: number; spanKind?: number };
      const end = Date.now();
      const start = data.startTime ?? end - record.durationMs;
      const route = safeRoute(record.route);
      const attributes = [
        { key: 'http.request.method', value: { stringValue: record.method } },
        { key: 'http.route', value: { stringValue: route } },
        { key: 'http.response.status_code', value: { intValue: String(record.status) } },
      ];
      const body = JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: options.serviceName } }],
            },
            scopeSpans: [
              {
                scope: { name: '@signalkit/server', version: '0.1.0' },
                spans: [
                  {
                    traceId: record.traceId ?? randomHex(16),
                    spanId: record.spanId ?? randomHex(8),
                    parentSpanId: record.parentSpanId,
                    name: `${record.method} ${route}`,
                    kind: data.spanKind ?? 3,
                    startTimeUnixNano: String(BigInt(Math.floor(start * 1_000_000))),
                    endTimeUnixNano: String(BigInt(end) * 1_000_000n),
                    attributes,
                    status: { code: record.error ? 2 : 0 },
                  },
                ],
              },
            ],
          },
        ],
      });
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve(), { once: true });
        timer = setTimeout(() => {
          diagnostic('timeout');
          controller.abort();
          resolve();
        }, timeout);
      });
      const delivery = Promise.resolve()
        .then(async () => {
          if (controller.signal.aborted) return;
          const response = await transport(options.endpoint, {
            method: 'POST',
            headers: { ...options.headers, 'content-type': 'application/json' },
            body,
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('OTLP rejected span');
          // OTLP partial rejection is not successful delivery.
          const text = await response.text();
          if (text) {
            const result = JSON.parse(text) as {
              partialSuccess?: { rejectedSpans?: string | number };
            };
            if (Number(result.partialSuccess?.rejectedSpans ?? 0) > 0)
              throw new Error('OTLP rejected spans');
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) diagnostic('transport');
        });
      const task = Promise.race([delivery, deadline]).finally(() => {
        clearTimeout(timer!);
        controllers.delete(controller);
        pending.delete(task);
      });
      pending.add(task);
      return task;
    },
    setConsent(consent) {
      allowed = consent.observability === true;
      if (!allowed) for (const controller of controllers) controller.abort();
    },
    async flush() {
      await Promise.all([...pending]);
    },
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
    },
  };
}
