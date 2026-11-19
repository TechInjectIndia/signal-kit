import {
  DENIED_CONSENT,
  sanitizeEvent,
  createEventRegistry,
  resolveProviderEvent,
  sanitizeEventContext,
  sanitizeUserIdentity,
  type EventDefinition,
  type EventContext,
  type RegisteredEventInput,
  type Consent,
  type DispatchResult,
  type DispatchStatus,
  type EventInput,
  type Provider,
  type SignalEvent,
  type TrackOptions,
  type UserIdentity,
} from '@techinject/contracts';
export type {
  Consent,
  DispatchResult,
  DispatchStatus,
  EventInput,
  EventName,
  EventContext,
  TrackOptions,
  UserIdentity,
  CustomerType,
  Provider,
  SignalEvent,
  Observer,
  RequestRecord,
  CommerceItem,
  CommerceProperties,
  CheckoutCorrelation,
  BeginCheckoutProperties,
  ShippingInfoProperties,
  PaymentInfoProperties,
  PurchaseProperties,
  RefundProperties,
  ItemListProperties,
  PageViewProperties,
} from '@techinject/contracts';
export { DENIED_CONSENT, defineEvent } from '@techinject/contracts';

export type {
  EventDefinition,
  EventMapping,
  EventMappings,
  RegisteredEventInput,
} from '@techinject/contracts';

export type SignalsOptions<Events extends readonly EventDefinition[] = readonly []> = {
  events?: Events;
  providers?: Provider[];
  consent?: Consent;
  timeoutMs?: number;
  maxPending?: number;
  onDiagnostic?: (result: DispatchResult) => void;
  /** Development aid. The host passes its own flag; the SDK reads no environment. */
  debug?: boolean;
  /** Called only when `debug` is true. Warnings carry the event name only, never values. */
  onWarning?: (warning: SignalsWarning) => void;
};
export type SignalsWarning = { code: 'duplicate_event'; name: string };
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
  skipped: number;
  lastStatus?: DispatchStatus;
  lastUpdated?: number;
};
export type Signals<Events extends readonly EventDefinition[] = readonly []> = ReturnType<
  typeof createSignals<Events>
>;
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
          // CUID (starts with c, 24 alphanumeric characters)
          if (/^c[0-9a-z]{24}$/i.test(decoded)) return ':id';
          return segment;
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
export function safeProviderUrl(input: string | URL): string {
  try {
    const url = new URL(String(input));
    return `${url.origin}${safeRoute(url.pathname)}`;
  } catch {
    return safeRoute(input);
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

export function createSignals<const Events extends readonly EventDefinition[] = readonly []>(
  options: SignalsOptions<Events> = {},
) {
  const registry = createEventRegistry(options.events);
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
    skipped: 0,
  }));
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
  // Per-call consent sends (`instance: false`) are aborted only by dispose, never by setConsent.
  const active = new Map<AbortController, { category: keyof Consent; instance: boolean }>();
  let user: UserIdentity | undefined;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1, Math.min(options.timeoutMs!, 60000))
    : 5000;
  const maxPending = Number.isFinite(options.maxPending)
    ? Math.max(1, Math.min(Math.floor(options.maxPending!), 1000))
    : 100;
  const recentEvents = new Map<string, number>();
  function warnDuplicate(event: SignalEvent) {
    // Development aid only: never suppresses delivery and never reports values.
    if (options.debug !== true) return;
    let key: string;
    try {
      key = `${event.name}\u0000${stableJson(event.properties)}`;
    } catch {
      return;
    }
    const now = Date.now();
    const previous = recentEvents.get(key);
    recentEvents.delete(key);
    recentEvents.set(key, now);
    while (recentEvents.size > 50) recentEvents.delete(recentEvents.keys().next().value!);
    if (previous === undefined || now - previous > 1000) return;
    try {
      options.onWarning?.({ code: 'duplicate_event', name: event.name });
    } catch {
      /* Warnings must not affect hosts. */
    }
  }
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
    notify();
    try {
      options.onDiagnostic?.(result);
    } catch {
      /* Diagnostics must not affect hosts. */
    }
    return result;
  }
  type Dispatch = {
    consent: Consent;
    /** True when the effective consent is the instance consent (aborted on withdrawal). */
    instance: boolean;
    categories?: ReadonlySet<keyof Consent>;
    providers?: ReadonlySet<string>;
    context?: EventContext;
  };
  /** `page` plus only the receiving family's slice; providers without a family get no context. */
  function scopeContext(
    context: EventContext | undefined,
    family: Provider['eventFamily'],
  ): EventContext | undefined {
    if (!context || !family) return undefined;
    const slice = (context as Record<string, unknown>)[family];
    const scoped: Record<string, unknown> = {};
    if (context.page) scoped.page = context.page;
    if (slice) scoped[family] = slice;
    return Object.keys(scoped).length ? (scoped as EventContext) : undefined;
  }
  async function send(
    provider: Provider,
    event: SignalEvent,
    dispatch: Dispatch,
  ): Promise<DispatchResult['outcomes'][number]> {
    if (
      (dispatch.categories && !dispatch.categories.has(provider.category)) ||
      (dispatch.providers && !dispatch.providers.has(provider.name))
    ) {
      return { provider: provider.name, status: 'skipped', reason: 'not_targeted' };
    }
    const effective = dispatch.instance ? consent : dispatch.consent;
    if (!effective[provider.category]) {
      return { provider: provider.name, status: 'denied', reason: 'consent' };
    }
    if (provider.eventFamily) {
      try {
        event = {
          ...event,
          providerEvent: resolveProviderEvent(
            event,
            provider.eventFamily,
            registry.get(event.name),
          ),
        };
      } catch (error) {
        return error instanceof Error && error.message === 'event_mapping_missing'
          ? { provider: provider.name, status: 'skipped', reason: 'event_mapping_missing' }
          : { provider: provider.name, status: 'invalid', reason: 'event_mapping' };
      }
    }
    const context = scopeContext(dispatch.context, provider.eventFamily);
    event = { ...event, consent: { ...effective }, ...(context ? { context } : {}) };
    const controller = new AbortController();
    active.set(controller, { category: provider.category, instance: dispatch.instance });
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
  const CATEGORIES: readonly (keyof Consent)[] = ['analytics', 'marketing', 'observability'];
  /** Reads untrusted options once. Returns a reason string when they are malformed. */
  function readOptions(value: unknown): Dispatch | 'track_options' | 'event_context' {
    if (value === undefined) return { consent, instance: true };
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'track_options';
    const raw = value as TrackOptions;
    const dispatch: Dispatch = { consent, instance: true };
    if (raw.categories !== undefined) {
      const categories: unknown = raw.categories;
      if (
        !Array.isArray(categories) ||
        !categories.every((entry) => CATEGORIES.includes(entry as keyof Consent))
      )
        return 'track_options';
      dispatch.categories = new Set(categories as (keyof Consent)[]);
    }
    if (raw.providers !== undefined) {
      const names: unknown = raw.providers;
      if (
        !Array.isArray(names) ||
        names.length > 20 ||
        !names.every((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 64)
      )
        return 'track_options';
      dispatch.providers = new Set(names as string[]);
    }
    if (raw.consent !== undefined) {
      dispatch.consent = normalizeConsent(raw.consent);
      dispatch.instance = false;
    }
    if (raw.context !== undefined) {
      const context = sanitizeEventContext(raw.context);
      if (context === undefined) return 'event_context';
      dispatch.context = context;
    }
    return dispatch;
  }
  function track(
    input: RegisteredEventInput<Events>,
    trackOptions?: TrackOptions,
  ): Promise<DispatchResult> {
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
          : sanitizeEvent(input, eventId, registry);
    } catch {
      event = undefined;
    }
    let dispatch: ReturnType<typeof readOptions> = 'track_options';
    try {
      dispatch = readOptions(trackOptions);
    } catch {
      /* Throwing getters are malformed options; values stay private. */
    }
    const failure: { status: DispatchStatus; reason: string } | undefined = !event
      ? { status: 'invalid', reason: 'event_schema' }
      : typeof dispatch === 'string'
        ? { status: 'invalid', reason: dispatch }
        : disposed || pending.size >= maxPending
          ? { status: 'dropped', reason: 'capacity_or_disposed' }
          : undefined;
    if (event && typeof dispatch !== 'string' && suppliedId === undefined && !disposed)
      warnDuplicate(event);
    if (failure)
      return Promise.resolve(
        report({
          eventId,
          outcomes: (providers.length ? providers.map((p) => p.name) : ['core']).map(
            (provider) => ({ provider, ...failure }),
          ),
        }),
      );
    const valid = event!;
    const plan = dispatch as Dispatch;
    const operation = Promise.all(providers.map((p) => send(p, valid, plan))).then((outcomes) =>
      report({ eventId, outcomes }),
    );
    pending.add(operation);
    void operation.finally(() => pending.delete(operation));
    return operation;
  }
  /** Fan the identity out to each provider, only while its category is granted. */
  function shareUser(next: UserIdentity | undefined) {
    for (const provider of providers) {
      try {
        provider.setUser?.(next && consent[provider.category] ? { ...next } : undefined);
      } catch {
        /* Host isolation. */
      }
    }
  }
  function setConsent(next: Consent) {
    consent = normalizeConsent(next);
    for (const connection of connections) connection.consent = consent[connection.category];
    notify();
    for (const [controller, owner] of active)
      if (owner.instance && !consent[owner.category]) controller.abort();
    for (const provider of providers) {
      try {
        provider.setConsent?.({ ...consent });
      } catch {
        /* Host isolation. */
      }
    }
    if (!disposed) shareUser(user);
  }
  setConsent(consent);
  return {
    track,
    setConsent,
    getConsent: () => ({ ...consent }),
    /** Sets the opaque host user key. An invalid identity is ignored and clears any previous one. */
    setUser(next: UserIdentity) {
      if (disposed) return;
      user = sanitizeUserIdentity(next);
      shareUser(user);
    },
    resetUser() {
      if (disposed) return;
      user = undefined;
      shareUser(undefined);
    },
    getConnections: (): ConnectionStatus[] => connections.map((connection) => ({ ...connection })),
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
      user = undefined;
      recentEvents.clear();
      for (const connection of connections) connection.disposed = true;
      notify();
      // Keep observers through aborted in-flight outcomes, then release them.
      if (pending.size) void Promise.all([...pending]).then(() => listeners.clear());
      else listeners.clear();
      for (const controller of active.keys()) controller.abort();
      shareUser(undefined);
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
/** Deterministic JSON with sorted object keys, for in-memory duplicate keys only. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export * from './attribution.js';
