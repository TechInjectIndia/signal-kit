import {
  DENIED_CONSENT,
  sanitizeEvent,
  type Consent,
  type DispatchResult,
  type EventInput,
  type Provider,
} from '@signalkit/contracts';
export type {
  Consent,
  DispatchResult,
  EventInput,
  Provider,
  SignalEvent,
  Observer,
  RequestRecord,
  CommerceItem,
  CommerceProperties,
  PurchaseProperties,
  PageViewProperties,
} from '@signalkit/contracts';
export { DENIED_CONSENT } from '@signalkit/contracts';

export type SignalsOptions = {
  providers?: Provider[];
  consent?: Consent;
  timeoutMs?: number;
  maxPending?: number;
  onDiagnostic?: (result: DispatchResult) => void;
};
export type Signals = ReturnType<typeof createSignals>;
export function generateId(): string {
  return globalThis.crypto.randomUUID();
}
export function safeRoute(url: string | URL, routeTemplate?: string): string {
  try {
    const path = new URL(routeTemplate ?? String(url), 'http://signalkit.invalid').pathname;
    return path
      .split('/')
      .map((segment) => {
        let decoded: string;
        try {
          decoded = decodeURIComponent(segment);
        } catch {
          return ':redacted';
        }
        return decoded.includes('@') || decoded.length > 64 ? ':redacted' : segment;
      })
      .join('/')
      .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
      .slice(0, 2048);
  } catch {
    return '/';
  }
}
export type TraceContext = { traceId: string; spanId: string; sampled: boolean };
export function parseTraceparent(value: string | null | undefined): TraceContext | undefined {
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(value ?? '');
  if (!match || /^0+$/.test(match[1]!) || /^0+$/.test(match[2]!)) return undefined;
  return {
    traceId: match[1]!,
    spanId: match[2]!,
    sampled: (Number.parseInt(match[3]!, 16) & 1) === 1,
  };
}
export function createTraceContext(): TraceContext {
  return {
    traceId: generateId().replaceAll('-', ''),
    spanId: generateId().replaceAll('-', '').slice(0, 16),
    sampled: true,
  };
}
export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? '01' : '00'}`;
}

export function createSignals(options: SignalsOptions = {}) {
  const providers = [...(options.providers ?? [])];
  function normalizeConsent(value?: Consent): Consent {
    return {
      analytics: value?.analytics === true,
      marketing: value?.marketing === true,
      observability: value?.observability === true,
    };
  }
  let consent = normalizeConsent(options.consent);
  let disposed = false;
  const pending = new Set<Promise<DispatchResult>>();
  const active = new Map<AbortController, keyof Consent>();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(options.timeoutMs!, 60000))
    : 5000;
  const maxPending = Number.isFinite(options.maxPending)
    ? Math.max(1, Math.min(Math.floor(options.maxPending!), 1000))
    : 100;
  function report(result: DispatchResult) {
    try {
      options.onDiagnostic?.(result);
    } catch {
      /* Diagnostics must not affect hosts. */
    }
    return result;
  }
  async function send(
    provider: Provider,
    event: NonNullable<ReturnType<typeof sanitizeEvent>>,
  ): Promise<DispatchResult['outcomes'][number]> {
    if (!consent[provider.category])
      return { provider: provider.name, status: 'denied', reason: 'consent' };
    const controller = new AbortController();
    active.set(controller, provider.category);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new Error('aborted');
          return provider.send(structuredClone(event), controller.signal);
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('timeout'));
          }, timeoutMs);
        }),
      ]);
      return { provider: provider.name, status: controller.signal.aborted ? 'dropped' : 'sent' };
    } catch {
      return {
        provider: provider.name,
        status: controller.signal.aborted ? 'dropped' : 'failed',
        reason: controller.signal.aborted ? 'aborted_or_timeout' : 'provider_error',
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      active.delete(controller);
    }
  }
  function track(input: EventInput): Promise<DispatchResult> {
    let suppliedId: string | undefined;
    try {
      suppliedId = input?.eventId;
    } catch {
      /* Invalid input stays private. */
    }
    const eventId =
      typeof suppliedId === 'string' && /^[\w.-]{1,128}$/.test(suppliedId)
        ? suppliedId
        : generateId();
    let event: ReturnType<typeof sanitizeEvent>;
    try {
      event =
        suppliedId !== undefined && suppliedId !== eventId
          ? undefined
          : sanitizeEvent(input, eventId);
    } catch {
      event = undefined;
    }
    const status = !event
      ? 'invalid'
      : disposed || pending.size >= maxPending
        ? 'dropped'
        : undefined;
    if (status)
      return Promise.resolve(
        report({
          eventId,
          outcomes: (providers.length ? providers.map((p) => p.name) : ['core']).map(
            (provider) => ({
              provider,
              status,
              reason: status === 'invalid' ? 'event_schema' : 'capacity_or_disposed',
            }),
          ),
        }),
      );
    const operation = Promise.all(providers.map((p) => send(p, event!))).then((outcomes) =>
      report({ eventId, outcomes }),
    );
    pending.add(operation);
    void operation.finally(() => pending.delete(operation));
    return operation;
  }
  function setConsent(next: Consent) {
    consent = normalizeConsent(next);
    for (const [controller, category] of active) if (!consent[category]) controller.abort();
    for (const provider of providers) {
      try {
        provider.setConsent?.({ ...consent });
      } catch {
        /* Host isolation. */
      }
    }
  }
  setConsent(consent);
  return {
    track,
    setConsent,
    getConsent: () => ({ ...consent }),
    flush: async () => {
      await Promise.all([...pending]);
    },
    dispose: () => {
      disposed = true;
      for (const controller of active.keys()) controller.abort();
      for (const provider of providers) {
        try {
          provider.dispose?.();
        } catch {
          /* Host isolation. */
        }
      }
    },
  };
}
