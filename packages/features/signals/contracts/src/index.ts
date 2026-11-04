import type { $ZodType, input as SchemaInput, output as SchemaOutput } from 'zod/v4/core';
import {
  string,
  number,
  object,
  array,
  optional,
  int,
  extend,
  minLength,
  maxLength,
  nonnegative,
  positive,
  maximum,
  regex,
  refine,
  union,
  clone,
  safeParse,
} from 'zod/mini';

export type Consent = { analytics: boolean; marketing: boolean; observability: boolean };
export const DENIED_CONSENT: Readonly<Consent> = Object.freeze({
  analytics: false,
  marketing: false,
  observability: false,
});
export type EventName =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'generate_lead'
  | 'sign_up'
  | 'login'
  | 'search';
export type CommerceItem = {
  item_id: string;
  item_name?: string;
  price?: number;
  quantity?: number;
  item_category?: string;
  item_brand?: string;
  item_variant?: string;
  coupon?: string;
  discount?: number;
};
export type CommerceProperties = {
  currency: string;
  value: number;
  items: CommerceItem[];
  shipping?: number;
  tax?: number;
  coupon?: string;
  affiliation?: string;
  payment_type?: string;
};
export type SingleProductViewProperties = {
  item_id: string;
  item_name?: string;
  price?: number;
  currency?: string;
  value?: number;
  item_category?: string;
  item_brand?: string;
  item_variant?: string;
  items?: CommerceItem[];
};
export type ProductViewProperties = CommerceProperties | SingleProductViewProperties;
export type PurchaseProperties = CommerceProperties & { transaction_id: string };
export type PageViewProperties = { page_path: string };
export type LeadProperties = { value?: number; currency?: string; lead_type?: string };
export type AuthProperties = { method?: string };
export type SearchProperties = { search_term: string };
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+/;
const PHONE_LIKE = /\+?\p{Nd}(?:[\s().-]*\p{Nd}){9,}/u;
/** Reject contact details in free-text event fields, including common URL-encoded forms. */
export function containsContactPii(value: string): boolean {
  let candidate = value;
  for (let pass = 0; pass < 3; pass++) {
    if (EMAIL_LIKE.test(candidate) || PHONE_LIKE.test(candidate)) return true;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
  return false;
}
type EventIdentity = { eventId?: string; timestamp?: number };
export type EventInput = EventIdentity &
  (
    | { name: 'page_view'; properties: PageViewProperties }
    | { name: 'product_view'; properties: ProductViewProperties }
    | { name: 'add_to_cart' | 'begin_checkout'; properties: CommerceProperties }
    | { name: 'purchase'; properties: PurchaseProperties }
    | { name: 'generate_lead'; properties: LeadProperties }
    | { name: 'sign_up' | 'login'; properties: AuthProperties }
    | { name: 'search'; properties: SearchProperties }
  );
export type SignalEvent = {
  name: string;
  eventId: string;
  timestamp: number;
  properties: Record<string, unknown>;
  providerEvent?: ProviderEvent;
};
export type RequestRecord = {
  kind: 'request';
  route: string;
  method: string;
  status: number;
  durationMs: number;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  error?: boolean;
};
export type Provider = {
  name: string;
  category: keyof Consent;
  eventFamily?: EventFamily;
  send(event: SignalEvent, signal?: AbortSignal): Promise<void> | void;
  dispose?(): void;
  setConsent?(consent: Consent): void;
};
export type Observer = {
  record(record: RequestRecord): Promise<void> | void;
  flush?(): Promise<void>;
  dispose?(): void;
  setConsent?(consent: Consent): void;
};
export type DispatchResult = {
  eventId: string;
  outcomes: {
    provider: string;
    status: 'sent' | 'denied' | 'failed' | 'invalid' | 'dropped';
    reason?: string;
  }[];
};

const text = string().check(minLength(1), maxLength(128));
const noContactPii = refine<string>((value) => !containsContactPii(value));
const freeText = string().check(minLength(1), maxLength(128), noContactPii);
const amount = number().check(nonnegative());
const currency = string().check(regex(/^[A-Z]{3}$/));
const item = object({
  item_id: text,
  item_name: optional(text),
  price: optional(amount),
  quantity: optional(int().check(positive(), maximum(100000))),
  item_category: optional(text),
  item_brand: optional(text),
  item_variant: optional(text),
  coupon: optional(text),
  discount: optional(amount),
});
const commerce = object({
  currency,
  value: amount,
  items: array(item).check(minLength(1), maxLength(100)),
  shipping: optional(amount),
  tax: optional(amount),
  coupon: optional(text),
  affiliation: optional(text),
  payment_type: optional(text),
});
const productViewCommerce = extend(commerce, {
  items: array(item).check(maxLength(100)),
});
const singleProductView = object({
  item_id: text,
  item_name: optional(text),
  price: optional(amount),
  currency: optional(currency),
  value: optional(amount),
  item_category: optional(text),
  item_brand: optional(text),
  item_variant: optional(text),
  items: optional(array(item).check(maxLength(100))),
});
const productViewSchema = union([productViewCommerce, singleProductView]);

const schemas = {
  page_view: object({ page_path: string().check(minLength(1), maxLength(2048)) }),
  product_view: productViewSchema,
  add_to_cart: commerce,
  begin_checkout: commerce,
  purchase: extend(commerce, {
    items: array(item).check(minLength(1), maxLength(100)),
    transaction_id: text,
  }),
  generate_lead: object({
    value: optional(amount),
    currency: optional(currency),
    lead_type: optional(freeText),
  }),
  sign_up: object({
    method: optional(freeText),
  }),
  login: object({
    method: optional(freeText),
  }),
  search: object({
    search_term: string().check(minLength(1), maxLength(256), noContactPii),
  }),
};

export type EventFamily = 'ga4' | 'meta' | 'clarity';
export type EventMapping<Key extends string = string> = Readonly<{
  name: string | Readonly<{ from: Key }>;
  properties?: Readonly<Record<string, Key>>;
  mode?: 'standard' | 'custom';
}>;
export type EventMappings<Key extends string = string> = Readonly<
  Partial<Record<EventFamily, EventMapping<Key>>>
>;
export type EventDefinition<
  Name extends string = string,
  Schema extends $ZodType = $ZodType,
> = Readonly<{ name: Name; schema: Schema; map: EventMappings }>;
type ConsumerInput<Definition> =
  Definition extends EventDefinition<infer Name, infer Schema>
    ? EventIdentity & { name: Name; properties: SchemaInput<Schema> }
    : never;
export type RegisteredEventInput<Events extends readonly EventDefinition[] = readonly []> =
  | EventInput
  | ConsumerInput<Events[number]>;
export type ProviderEvent = {
  family: EventFamily;
  name: string;
  properties: Record<string, unknown>;
  mode?: 'standard' | 'custom';
};

const META_STANDARD_NAMES = new Set([
  'PageView',
  'ViewContent',
  'AddToCart',
  'AddToWishlist',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
  'Lead',
  'Contact',
  'CompleteRegistration',
  'Search',
  'CustomizeProduct',
  'Donate',
  'FindLocation',
  'Schedule',
  'StartTrial',
  'SubmitApplication',
  'Subscribe',
]);
const META_NAMES: Record<EventName, string> = {
  page_view: 'PageView',
  product_view: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  purchase: 'Purchase',
  generate_lead: 'Lead',
  search: 'Search',
  sign_up: 'CompleteRegistration',
  login: 'Login',
};
const PREDEFINED_EVENTS: ReadonlyMap<string, EventDefinition> = new Map(
  (Object.keys(schemas) as EventName[]).map((name) => [
    name,
    {
      name,
      schema: schemas[name],
      map: {
        ga4: { name: name === 'product_view' ? 'view_item' : name },
        meta: { name: META_NAMES[name], mode: name === 'login' ? 'custom' : 'standard' },
        clarity: { name },
      },
    },
  ]),
);
const RESERVED_PROVIDER_NAMES = new Set([
  ...PREDEFINED_EVENTS.keys(),
  'view_item',
  ...Object.values(META_NAMES),
]);
const FORBIDDEN_KEYS = new Set([
  'em',
  'ph',
  'fn',
  'ln',
  'email',
  'emailaddress',
  'phone',
  'phonenumber',
  'destination',
  'userid',
  'firstname',
  'lastname',
  'fullname',
  'clientipaddress',
  'clientuseragent',
  'ipaddress',
  'password',
  'accesstoken',
  'authorization',
  '__proto__',
  'prototype',
  'constructor',
]);
const RESERVED_WIRE_KEYS = new Set([
  'event_id',
  'eventID',
  'send_to',
  'event_name',
  'event_time',
  'user_data',
  'access_token',
]);
function safeKey(key: string): boolean {
  return (
    key.length <= 128 &&
    !containsContactPii(key) &&
    !FORBIDDEN_KEYS.has(key.replace(/[^a-z]/gi, '').toLowerCase()) &&
    !['__proto__', 'prototype', 'constructor'].includes(key)
  );
}
/** Shared post-parse privacy/resource boundary, including nested consumer properties. */
export function isSafeEventProperties(value: unknown): value is Record<string, unknown> {
  let nodes = 0;
  const visit = (entry: unknown, depth: number): boolean => {
    if (++nodes > 5000 || depth > 8) return false;
    if (entry === null || entry === undefined || typeof entry === 'boolean') return true;
    if (typeof entry === 'number') return Number.isFinite(entry);
    if (typeof entry === 'string') return entry.length <= 2048 && !containsContactPii(entry);
    if (Array.isArray(entry))
      return entry.length <= 100 && entry.every((item) => visit(item, depth + 1));
    if (!entry || typeof entry !== 'object' || Object.getPrototypeOf(entry) !== Object.prototype)
      return false;
    const entries = Object.entries(entry);
    return (
      entries.length <= 100 &&
      entries.every(([key, item]) => safeKey(key) && visit(item, depth + 1))
    );
  };
  try {
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      visit(value, 0) &&
      JSON.stringify(value).length <= 65536
    );
  } catch {
    return false;
  }
}

/** Only synchronous, closed JSON schemas can define consumer payloads. Clone schema nodes so
 * mutating an app's original schema after registration cannot change the instance contract. */
function snapshotSchema(schema: $ZodType, depth = 0): $ZodType {
  if (depth > 8 || !schema?._zod) throw new Error('Invalid event schema');
  const def = { ...schema._zod.def } as Record<string, unknown>;
  switch (def.type) {
    case 'object': {
      if (def.catchall !== undefined) throw new Error('Event objects must strip unknown keys');
      const shape = def.shape as Record<string, $ZodType>;
      if (Object.keys(shape).length > 100 || Object.keys(shape).some((key) => !safeKey(key)))
        throw new Error('Invalid event schema');
      def.shape = Object.fromEntries(
        Object.entries(shape).map(([key, child]) => [key, snapshotSchema(child, depth + 1)]),
      );
      break;
    }
    case 'array':
      def.element = snapshotSchema(def.element as $ZodType, depth + 1);
      break;
    case 'optional':
    case 'nullable':
      def.innerType = snapshotSchema(def.innerType as $ZodType, depth + 1);
      break;
    case 'union':
      def.options = (def.options as $ZodType[]).map((child) => snapshotSchema(child, depth + 1));
      break;
    case 'string':
    case 'number':
    case 'boolean':
    case 'literal':
    case 'enum':
    case 'null':
      break;
    default:
      throw new Error('Unsupported event schema');
  }
  if (def.checks) def.checks = [...(def.checks as unknown[])];
  return clone(schema, def as unknown as $ZodType['_zod']['def']);
}
function validMappedName(
  name: unknown,
  family: EventFamily,
  mode: EventMapping['mode'],
  consumer: boolean,
): name is string {
  if (typeof name !== 'string' || containsContactPii(name)) return false;
  if (consumer && RESERVED_PROVIDER_NAMES.has(name)) return false;
  if (family === 'meta') {
    if (mode === 'standard') return META_STANDARD_NAMES.has(name);
    if (mode !== 'custom') return false;
  } else if (mode !== undefined) return false;
  // The predefined Meta Login event uses the custom API with its existing vendor name.
  return (!consumer && family === 'meta' && name === 'Login') || EVENT_NAME_PATTERN.test(name);
}
function stringSchema(schema: $ZodType): boolean {
  const def = schema._zod.def as unknown as Record<string, unknown>;
  if (def.type === 'string') return true;
  if (def.type === 'literal')
    return (def.values as unknown[]).every((value) => typeof value === 'string');
  if (def.type === 'enum')
    return Object.values(def.entries as object).every((value) => typeof value === 'string');
  if (def.type === 'union') return (def.options as $ZodType[]).every(stringSchema);
  return false;
}
export function defineEvent<const Name extends string, Schema extends $ZodType>(definition: {
  name: Name;
  schema: Schema;
  map: EventMappings<Extract<keyof SchemaOutput<Schema>, string>>;
}): EventDefinition<Name, Schema> {
  return snapshotEventDefinition(definition) as EventDefinition<Name, Schema>;
}
function snapshotEventDefinition(definition: EventDefinition): EventDefinition {
  if (
    typeof definition.name !== 'string' ||
    !EVENT_NAME_PATTERN.test(definition.name) ||
    containsContactPii(definition.name) ||
    PREDEFINED_EVENTS.has(definition.name)
  )
    throw new Error('Invalid or reserved event name');
  if (definition.schema?._zod.def.type !== 'object')
    throw new Error('Event schema must be an object');
  const schema = snapshotSchema(definition.schema);
  const shape = (schema._zod.def as unknown as { shape: Record<string, $ZodType> }).shape;
  const keys = new Set(Object.keys(shape));
  const map: Partial<Record<EventFamily, EventMapping>> = {};
  for (const [family, mapping] of Object.entries(definition.map)) {
    if (!['ga4', 'meta', 'clarity'].includes(family) || !mapping)
      throw new Error('Invalid event mapping');
    const target = family as EventFamily;
    const dynamic = typeof mapping.name !== 'string';
    if (
      dynamic
        ? !mapping.name || !keys.has(mapping.name.from)
        : !validMappedName(mapping.name, target, mapping.mode, true)
    )
      throw new Error('Invalid event mapping name');
    if (dynamic && !stringSchema(shape[(mapping.name as { from: string }).from]!))
      throw new Error('Mapped event name requires a string schema');
    if (target === 'meta' && !['standard', 'custom'].includes(mapping.mode ?? ''))
      throw new Error('Meta mapping mode required');
    if (target !== 'meta' && mapping.mode !== undefined)
      throw new Error('Invalid event mapping mode');
    const properties = { ...mapping.properties };
    if (target === 'clarity' && Object.keys(properties).length)
      throw new Error('Clarity accepts only an event name');
    if (target !== 'clarity' && !mapping.properties)
      throw new Error('Explicit property projection required');
    for (const [key, source] of Object.entries(properties)) {
      if (!safeKey(key) || RESERVED_WIRE_KEYS.has(key) || !keys.has(source))
        throw new Error('Invalid event property projection');
    }
    map[target] = Object.freeze({
      name: dynamic
        ? Object.freeze({ from: (mapping.name as { from: string }).from })
        : mapping.name,
      ...(mapping.mode ? { mode: mapping.mode } : {}),
      properties: Object.freeze(properties),
    });
  }
  return Object.freeze({ name: definition.name, schema, map: Object.freeze(map) });
}
export function createEventRegistry(
  events: readonly EventDefinition[] = [],
): ReadonlyMap<string, EventDefinition> {
  if (events.length > 100) throw new Error('Too many event definitions');
  const registry = new Map(PREDEFINED_EVENTS);
  for (const definition of events) {
    if (registry.has(definition.name)) throw new Error('Duplicate or reserved event name');
    registry.set(definition.name, snapshotEventDefinition(definition));
  }
  return registry;
}
/** Existing ecommerce conversion belongs to predefined mappings only. Consumer projections
 * already use the destination provider's property names and must remain unchanged. */
function predefinedMetaProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const { items, transaction_id, ...remaining } = properties;
  const entries = items as
    | Array<{ item_id: string; quantity?: number; price?: number }>
    | undefined;
  return {
    ...remaining,
    ...(transaction_id ? { order_id: transaction_id } : {}),
    ...(entries
      ? {
          content_type: 'product',
          content_ids: entries.map((item) => item.item_id),
          contents: entries.map((item) => ({
            id: item.item_id,
            quantity: item.quantity ?? 1,
            item_price: item.price,
          })),
        }
      : {}),
  };
}
/** Resolve after consent; optional definitions are instance-owned and never held globally. */
export function resolveProviderEvent(
  event: SignalEvent,
  family: EventFamily,
  definition?: EventDefinition,
): ProviderEvent {
  const builtin = PREDEFINED_EVENTS.has(event.name);
  const mapping = (definition ?? PREDEFINED_EVENTS.get(event.name))?.map[family];
  if (!mapping) throw new Error('event_mapping_missing');
  const name =
    typeof mapping.name === 'string' ? mapping.name : event.properties[mapping.name.from];
  if (!validMappedName(name, family, mapping.mode, !builtin)) throw new Error('event_mapping');
  const properties = mapping.properties
    ? Object.fromEntries(
        Object.entries(mapping.properties)
          .filter(([, source]) => event.properties[source] !== undefined)
          .map(([key, source]) => [key, event.properties[source]]),
      )
    : event.properties;
  const result = {
    family,
    name,
    properties:
      family === 'clarity'
        ? {}
        : family === 'meta' && builtin
          ? predefinedMetaProperties(properties)
          : properties,
    ...(mapping.mode ? { mode: mapping.mode } : {}),
  };
  return validateProviderEvent(event, family, result);
}
function validateProviderEvent(
  event: SignalEvent,
  family: EventFamily,
  mapped: ProviderEvent,
): ProviderEvent {
  if (
    mapped.family !== family ||
    !validMappedName(mapped.name, family, mapped.mode, !PREDEFINED_EVENTS.has(event.name)) ||
    !isSafeEventProperties(mapped.properties) ||
    Object.keys(mapped.properties).some((key) => RESERVED_WIRE_KEYS.has(key))
  )
    throw new Error('event_mapping');
  return mapped;
}
/** Direct predefined adapter calls remain supported; consumer calls require core's resolved mapping. */
export function getProviderEvent(event: SignalEvent, family: EventFamily): ProviderEvent {
  if (
    !event ||
    !/^[\w.-]{1,128}$/.test(event.eventId) ||
    !Number.isFinite(event.timestamp) ||
    event.timestamp < 0
  )
    throw new Error('Invalid event identity');
  if (event.providerEvent) return validateProviderEvent(event, family, event.providerEvent);
  const safe = sanitizeEvent(event, event.eventId);
  if (!safe) throw new Error('Invalid event');
  return resolveProviderEvent(safe, family);
}
/** Unknown fields are stripped; request URLs, identity, and arbitrary metadata never pass through. */
export function sanitizeEvent(
  value: unknown,
  eventId: string,
  registry: ReadonlyMap<string, EventDefinition> = PREDEFINED_EVENTS,
): SignalEvent | undefined {
  const input = value as SignalEvent;
  if (!input || typeof input !== 'object') return undefined;
  const definition = registry.get(input.name);
  if (!definition) return undefined;
  if (!/^[\w.-]{1,128}$/.test(eventId)) return undefined;
  const timestamp = input.timestamp ?? Date.now();
  if (!Number.isFinite(timestamp) || timestamp < 0) return undefined;
  const parsed = safeParse(definition.schema, input.properties);
  if (!parsed.success) return undefined;
  if (input.name === 'page_view') {
    const properties = parsed.data as { page_path: string };
    // Only local paths may be supplied; strip potential query and fragment identifiers.
    if (!properties.page_path.startsWith('/') || properties.page_path.startsWith('//'))
      return undefined;
    properties.page_path = properties.page_path.split(/[?#]/)[0] ?? '/';
  }
  if (!isSafeEventProperties(parsed.data)) return undefined;
  return {
    name: input.name,
    eventId,
    timestamp,
    properties: parsed.data as Record<string, unknown>,
  };
}
