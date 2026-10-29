import {
  DENIED_CONSENT,
  sanitizeEvent,
  type Consent,
  type DispatchResult,
  type EventInput,
  type Provider,
} from '@techinject/contracts';
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
} from '@techinject/contracts';
export { DENIED_CONSENT } from '@techinject/contracts';

export type SignalsOptions = {
  providers?: Provider[];
  consent?: Consent;
  timeoutMs?: number;
  maxPending?: number;
  onDiagnostic?: (result: DispatchResult) => void;
  queueBeforeConsent?: boolean;
  persistKey?: string;
};
export type ConnectionStatus = {
  name: string;
  category: keyof Consent;
  consent: boolean;
  disposed: boolean;
  attempts: number;
  sent: number;
  failed: number;
  denied: number;
  dropped: number;
  invalid: number;
  lastStatus?: DispatchResult['outcomes'][number]['status'];
  lastUpdated?: number;
};
export type Signals = ReturnType<typeof createSignals>;
export function generateId(): string {
  return globalThis.crypto.randomUUID();
}
export function safeRoute(url: string | URL, routeTemplate?: string): string {
  try {
    const raw = String(routeTemplate ?? url);
    // Strip layout route groups like /(marketing) or /(app)
    const cleaned = raw.replace(/\/\([^)]+\)/g, '');
    const path = new URL(cleaned || '/', 'http://signalkit.invalid').pathname;
    return (
      path
        .split('/')
        .filter((segment) => !/^\([^)]+\)$/.test(segment))
        .map((segment) => {
          let decoded: string;
          try {
            decoded = decodeURIComponent(segment);
          } catch {
            return ':redacted';
          }
          if (decoded.includes('@') || decoded.length > 64) return ':redacted';
          // MongoDB ObjectID (24 hex characters)
          if (/^[0-9a-f]{24}$/i.test(decoded)) return ':id';
          // Stripe ID (cs_..., pi_..., ch_..., cus_..., etc.)
          if (/^(cs|pi|ch|cus|sub|in|evt|tok)_[a-zA-Z0-9_]{8,}$/i.test(decoded)) return ':id';
          // Order / reference prefixes (e.g., ORD-98721, REF-1234)
          if (/^[A-Za-z]{2,6}-[0-9A-Za-z_-]{3,}$/.test(decoded)) return ':id';
          // CUID (starts with c, 24 alphanumeric characters)
          if (/^c[0-9a-z]{24}$/i.test(decoded)) return ':id';
          // High entropy IDs (20+ alphanumeric characters with both digits and letters)
          if (decoded.length >= 20 && /[0-9]/.test(decoded) && /[a-zA-Z]/.test(decoded))
            return ':id';
          return decoded;
        })
        .join('/')
        .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
        .slice(0, 2048) || '/'
    );
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
  const connections: ConnectionStatus[] = providers.map((provider) => ({
    name: provider.name,
    category: provider.category,
    consent: false,
    disposed: false,
    attempts: 0,
    sent: 0,
    failed: 0,
    denied: 0,
    dropped: 0,
    invalid: 0,
  }));
  if (options.persistKey && typeof globalThis.sessionStorage !== 'undefined') {
    try {
      const saved = sessionStorage.getItem(options.persistKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ConnectionStatus>[];
        for (const conn of connections) {
          const match = parsed.find((p) => p.name === conn.name && p.category === conn.category);
          if (match) {
            conn.attempts = match.attempts ?? 0;
            conn.sent = match.sent ?? 0;
            conn.failed = match.failed ?? 0;
            conn.denied = match.denied ?? 0;
            conn.dropped = match.dropped ?? 0;
            conn.invalid = match.invalid ?? 0;
            conn.lastStatus = match.lastStatus;
            conn.lastUpdated = match.lastUpdated;
          }
        }
      }
    } catch {}
  }
  const consentQueue: Array<{ event: NonNullable<ReturnType<typeof sanitizeEvent>> }> = [];
  const queueBeforeConsent = options.queueBeforeConsent === true;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Status UI must not affect hosts. */
      }
    }
  };
  const pending = new Set<Promise<DispatchResult>>();
  const active = new Map<AbortController, keyof Consent>();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(options.timeoutMs!, 60000))
    : 5000;
  const maxPending = Number.isFinite(options.maxPending)
    ? Math.max(1, Math.min(Math.floor(options.maxPending!), 1000))
    : 100;
  function report(result: DispatchResult) {
    // Outcomes retain provider order, including duplicate names. Never retain payloads or IDs.
    result.outcomes.forEach((outcome, index) => {
      const connection = connections[index];
      if (!connection) return;
      connection.attempts++;
      connection[outcome.status]++;
      connection.lastStatus = outcome.status;
      connection.lastUpdated = Date.now();
    });
    if (options.persistKey && typeof globalThis.sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(options.persistKey, JSON.stringify(connections));
      } catch {}
    }
    notify();
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
    if (!consent[provider.category]) {
      if (queueBeforeConsent && consentQueue.length < 100) {
        if (!consentQueue.some((q) => q.event.eventId === event.eventId)) {
          consentQueue.push({ event: structuredClone(event) });
        }
      }
      return { provider: provider.name, status: 'denied', reason: 'consent' };
    }
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
    const previous = { ...consent };
    consent = normalizeConsent(next);
    for (const connection of connections) connection.consent = consent[connection.category];
    notify();
    for (const [controller, category] of active) if (!consent[category]) controller.abort();
    for (const provider of providers) {
      try {
        provider.setConsent?.({ ...consent });
      } catch {
        /* Host isolation. */
      }
    }
    if (queueBeforeConsent && consentQueue.length > 0) {
      const newlyGrantedCategories = (['analytics', 'marketing', 'observability'] as const).filter(
        (cat) => !previous[cat] && consent[cat],
      );
      if (newlyGrantedCategories.length > 0) {
        const toReplay = [...consentQueue];
        consentQueue.length = 0;
        for (const item of toReplay) {
          const eligibleProviders = providers.filter((p) =>
            newlyGrantedCategories.includes(p.category),
          );
          if (eligibleProviders.length > 0) {
            void Promise.all(eligibleProviders.map((p) => send(p, item.event))).then((outcomes) =>
              report({ eventId: item.event.eventId, outcomes }),
            );
          }
        }
      }
    }
  }
  setConsent(consent);
  return {
    track,
    setConsent,
    getConsent: () => ({ ...consent }),
    getConnections: (): ConnectionStatus[] => connections.map((connection) => ({ ...connection })),
    replayConsentQueue: () => {
      const toReplay = [...consentQueue];
      consentQueue.length = 0;
      const tasks = toReplay.map((item) =>
        Promise.all(
          providers.filter((p) => consent[p.category]).map((p) => send(p, item.event)),
        ).then((outcomes) => report({ eventId: item.event.eventId, outcomes })),
      );
      return Promise.all(tasks);
    },
    subscribeConnections(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush: async () => {
      await Promise.all([...pending]);
    },
    dispose: () => {
      disposed = true;
      for (const connection of connections) connection.disposed = true;
      notify();
      // Keep observers through aborted in-flight outcomes, then release them.
      if (pending.size) void Promise.all([...pending]).then(() => listeners.clear());
      else listeners.clear();
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
