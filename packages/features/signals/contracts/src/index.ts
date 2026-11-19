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
  literal,
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
  | 'search'
  | 'remove_from_cart'
  | 'view_cart'
  | 'add_shipping_info'
  | 'add_payment_info'
  | 'refund'
  | 'view_item_list'
  | 'select_item'
  | 'add_to_wishlist';
export type CustomerType = 'guest' | 'registered';
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
  /** Integer position in a list, 0..10000. */
  index?: number;
  item_list_id?: string;
  item_list_name?: string;
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
/** Host-supplied checkout correlation. The SDK never generates or defaults these values. */
export type CheckoutCorrelation = { checkout_id?: string; customer_type?: CustomerType };
export type BeginCheckoutProperties = CommerceProperties & CheckoutCorrelation;
export type ShippingInfoProperties = CommerceProperties &
  CheckoutCorrelation & { shipping_tier?: string };
export type PaymentInfoProperties = CommerceProperties &
  CheckoutCorrelation & { payment_attempt_id?: string };
export type RefundProperties = {
  transaction_id: string;
  /** Required whenever `value` is present. */
  currency?: string;
  value?: number;
  /** Omit for a full refund. */
  items?: CommerceItem[];
  shipping?: number;
  tax?: number;
  coupon?: string;
  affiliation?: string;
};
export type ItemListProperties = {
  items: CommerceItem[];
  item_list_id?: string;
  item_list_name?: string;
};
/**
 * @deprecated Pass the commerce shape with `items: [item]`. Still accepted; normalised to
 * `{ currency?, value?, items }` before any provider sees it.
 */
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
export type PurchaseProperties = CommerceProperties &
  CheckoutCorrelation & { transaction_id: string; payment_attempt_id?: string };
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
/** Whole-value separator-formatted phone numbers such as 202-555-0100 or 91.98765.43210. */
const FORMATTED_PHONE = /^\p{Nd}{1,4}(?:[.-]\p{Nd}{1,5}){2,4}$/u;
/**
 * Identifier fields (SKUs, order and checkout references) may legitimately hold long digit runs,
 * so they skip the free-text phone heuristic. They still reject email-like values, `+` prefixes,
 * whitespace, parentheses and whole-value separator-formatted phone numbers, including common
 * URL-encoded forms.
 */
function containsIdentifierPii(value: string): boolean {
  let candidate = value;
  for (let pass = 0; pass < 3; pass++) {
    if (
      EMAIL_LIKE.test(candidate) ||
      candidate.startsWith('+') ||
      /[\s()]/u.test(candidate) ||
      (FORMATTED_PHONE.test(candidate) && candidate.replace(/\D/g, '').length >= 10)
    )
      return true;
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
/** Property keys whose string values (or string array entries) follow the identifier rule. */
const IDENTIFIER_KEYS = new Set([
  'item_id',
  'transaction_id',
  'checkout_id',
  'payment_attempt_id',
  'item_list_id',
  // Predefined Meta projections.
  'order_id',
  'content_ids',
]);
type EventIdentity = { eventId?: string; timestamp?: number };
export type EventInput = EventIdentity &
  (
    | { name: 'page_view'; properties: PageViewProperties }
    | { name: 'product_view'; properties: ProductViewProperties }
    | { name: 'add_to_cart'; properties: CommerceProperties }
    | { name: 'begin_checkout'; properties: BeginCheckoutProperties }
    | { name: 'purchase'; properties: PurchaseProperties }
    | { name: 'generate_lead'; properties: LeadProperties }
    | { name: 'sign_up' | 'login'; properties: AuthProperties }
    | { name: 'search'; properties: SearchProperties }
    | { name: 'remove_from_cart' | 'view_cart' | 'add_to_wishlist'; properties: CommerceProperties }
    | { name: 'add_shipping_info'; properties: ShippingInfoProperties }
    | { name: 'add_payment_info'; properties: PaymentInfoProperties }
    | { name: 'refund'; properties: RefundProperties }
    | { name: 'view_item_list' | 'select_item'; properties: ItemListProperties }
  );
/** Opaque host-owned user key. Never an email address, phone number or name. */
export type UserIdentity = {
  /** 1..128 characters, `/^[A-Za-z0-9][A-Za-z0-9._:-]*$/`. */
  id: string;
  customerType?: CustomerType;
};
/**
 * Typed transport context, kept apart from event properties and never included in diagnostics.
 * Core forwards `page` plus only the slice for the receiving provider's event family.
 */
export type EventContext = {
  page?: { location?: string; referrer?: string };
  ga4?: { clientId?: string; sessionId?: string; userId?: string };
  meta?: { userData?: Record<string, string | string[]>; eventSourceUrl?: string };
};
export type TrackOptions = {
  /** Server use. Replaces instance consent for this call only. */
  consent?: Consent;
  context?: EventContext;
  /** Deliver only to providers in these consent categories; others report `skipped`. */
  categories?: readonly (keyof Consent)[];
  /**
   * Deliver only to providers whose `name` is listed (at most 20 names, each 1 to 64 characters);
   * others report `skipped`/`not_targeted`. Combined with `categories`, a provider must match both.
   */
  providers?: readonly string[];
};
export type SignalEvent = {
  name: string;
  eventId: string;
  timestamp: number;
  properties: Record<string, unknown>;
  providerEvent?: ProviderEvent;
  /** Set by core: `page` plus the slice for the receiving provider's family. */
  context?: EventContext;
  /** Effective consent snapshot for this dispatch. */
  consent?: Consent;
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
  /** Start loading vendor resources. Must not send data. Called only while the category is granted. */
  prepare?(): void | Promise<void>;
  /** Called by core with the identity while the provider's category is granted, else `undefined`. */
  setUser?(user: UserIdentity | undefined): void;
  /** Vendor-owned anonymous identifiers. Called only while the category is granted. */
  identifiers?(): Promise<Readonly<Record<string, string>>> | Readonly<Record<string, string>>;
};
export type Observer = {
  record(record: RequestRecord): Promise<void> | void;
  flush?(): Promise<void>;
  dispose?(): void;
  setConsent?(consent: Consent): void;
};
/**
 * `skipped` means the provider was deliberately not called: it has no mapping for the event
 * (`event_mapping_missing`) or the call targeted other consent categories or provider names
 * (`not_targeted`).
 */
export type DispatchStatus = 'sent' | 'denied' | 'failed' | 'invalid' | 'dropped' | 'skipped';
export type DispatchResult = {
  eventId: string;
  outcomes: {
    provider: string;
    status: DispatchStatus;
    reason?: string;
  }[];
};

const text = string().check(minLength(1), maxLength(128));
const idText = string().check(minLength(1), maxLength(128));
const customerType = union([literal('guest'), literal('registered')]);
const noContactPii = refine<string>((value) => !containsContactPii(value));
const freeText = string().check(minLength(1), maxLength(128), noContactPii);
const amount = number().check(nonnegative());
const currency = string().check(regex(/^[A-Z]{3}$/));
const item = object({
  item_id: idText,
  item_name: optional(text),
  price: optional(amount),
  quantity: optional(int().check(positive(), maximum(100000))),
  item_category: optional(text),
  item_brand: optional(text),
  item_variant: optional(text),
  coupon: optional(text),
  discount: optional(amount),
  index: optional(int().check(nonnegative(), maximum(10000))),
  item_list_id: optional(idText),
  item_list_name: optional(freeText),
});
const items = array(item).check(minLength(1), maxLength(100));
const commerce = object({
  currency,
  value: amount,
  items,
  shipping: optional(amount),
  tax: optional(amount),
  coupon: optional(text),
  affiliation: optional(text),
  payment_type: optional(text),
});
const correlation = {
  checkout_id: optional(idText),
  customer_type: optional(customerType),
};
const productViewCommerce = extend(commerce, {
  items: array(item).check(maxLength(100)),
});
const singleProductView = object({
  item_id: idText,
  item_name: optional(text),
  price: optional(amount),
  currency: optional(currency),
  value: optional(amount),
  item_category: optional(text),
  item_brand: optional(text),
  item_variant: optional(text),
  items: optional(array(item).check(maxLength(100))),
});
/** The normalised output of the single-item shape. Accepted so direct adapter calls that
 * re-validate an already-sanitised event (`getProviderEvent`) see a stable contract. */
const canonicalProductView = object({
  currency: optional(currency),
  value: optional(amount),
  items: array(item).check(maxLength(100)),
}).check(
  refine((view) => view.value === undefined || view.currency !== undefined, {
    message: 'value requires currency',
  }),
);
const productViewSchema = union([productViewCommerce, singleProductView, canonicalProductView]);
const itemList = object({
  items,
  item_list_id: optional(idText),
  item_list_name: optional(freeText),
});

const schemas = {
  page_view: object({ page_path: string().check(minLength(1), maxLength(2048)) }),
  product_view: productViewSchema,
  add_to_cart: commerce,
  begin_checkout: extend(commerce, correlation),
  purchase: extend(commerce, {
    ...correlation,
    transaction_id: idText,
    payment_attempt_id: optional(idText),
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
  remove_from_cart: commerce,
  view_cart: commerce,
  add_shipping_info: extend(commerce, { ...correlation, shipping_tier: optional(freeText) }),
  add_payment_info: extend(commerce, { ...correlation, payment_attempt_id: optional(idText) }),
  refund: object({
    transaction_id: idText,
    currency: optional(currency),
    value: optional(amount),
    items: optional(array(item).check(maxLength(100))),
    shipping: optional(amount),
    tax: optional(amount),
    coupon: optional(text),
    affiliation: optional(text),
  }).check(
    refine((refund) => refund.value === undefined || refund.currency !== undefined, {
      message: 'value requires currency',
    }),
  ),
  view_item_list: itemList,
  select_item: itemList,
  add_to_wishlist: commerce,
} satisfies Record<EventName, $ZodType>;

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
/**
 * Explicit predefined mapping table. GA4 and Clarity cover every predefined event; Meta covers only
 * events with a Meta standard (or the established custom `Login`) equivalent. A family without an
 * entry makes `resolveProviderEvent` throw `event_mapping_missing`, which core reports as skipped.
 */
const PREDEFINED_MAPPINGS: Record<
  EventName,
  { ga4: string; meta?: { name: string; mode: 'standard' | 'custom' } }
> = {
  page_view: { ga4: 'page_view', meta: { name: 'PageView', mode: 'standard' } },
  product_view: { ga4: 'view_item', meta: { name: 'ViewContent', mode: 'standard' } },
  add_to_cart: { ga4: 'add_to_cart', meta: { name: 'AddToCart', mode: 'standard' } },
  begin_checkout: { ga4: 'begin_checkout', meta: { name: 'InitiateCheckout', mode: 'standard' } },
  purchase: { ga4: 'purchase', meta: { name: 'Purchase', mode: 'standard' } },
  generate_lead: { ga4: 'generate_lead', meta: { name: 'Lead', mode: 'standard' } },
  search: { ga4: 'search', meta: { name: 'Search', mode: 'standard' } },
  sign_up: { ga4: 'sign_up', meta: { name: 'CompleteRegistration', mode: 'standard' } },
  login: { ga4: 'login', meta: { name: 'Login', mode: 'custom' } },
  remove_from_cart: { ga4: 'remove_from_cart' },
  view_cart: { ga4: 'view_cart' },
  add_shipping_info: { ga4: 'add_shipping_info' },
  add_payment_info: { ga4: 'add_payment_info', meta: { name: 'AddPaymentInfo', mode: 'standard' } },
  refund: { ga4: 'refund' },
  view_item_list: { ga4: 'view_item_list' },
  select_item: { ga4: 'select_item' },
  add_to_wishlist: { ga4: 'add_to_wishlist', meta: { name: 'AddToWishlist', mode: 'standard' } },
};
const PREDEFINED_EVENTS: ReadonlyMap<string, EventDefinition> = new Map(
  (Object.keys(schemas) as EventName[]).map((name) => {
    const { ga4, meta } = PREDEFINED_MAPPINGS[name];
    return [
      name,
      Object.freeze({
        name,
        schema: schemas[name],
        map: Object.freeze({
          ga4: Object.freeze({ name: ga4 }),
          ...(meta ? { meta: Object.freeze({ ...meta }) } : {}),
          clarity: Object.freeze({ name }),
        }),
      }),
    ];
  }),
);
/** Predefined SDK names and every provider name they map to are unavailable to consumer events. */
const RESERVED_PROVIDER_NAMES = new Set([
  ...PREDEFINED_EVENTS.keys(),
  ...Object.values(PREDEFINED_MAPPINGS).flatMap(({ ga4, meta }) =>
    meta ? [ga4, meta.name] : [ga4],
  ),
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
  // `identifier` values follow the identifier rule; `contents` marks Meta's contents[] whose `id`
  // entries are identifiers too. Everything else keeps the full free-text guard.
  type Field = 'identifier' | 'contents' | undefined;
  const visit = (entry: unknown, depth: number, field: Field): boolean => {
    if (++nodes > 5000 || depth > 8) return false;
    if (entry === null || entry === undefined || typeof entry === 'boolean') return true;
    if (typeof entry === 'number') return Number.isFinite(entry);
    if (typeof entry === 'string')
      return (
        entry.length <= 2048 &&
        !(field === 'identifier' ? containsIdentifierPii(entry) : containsContactPii(entry))
      );
    if (Array.isArray(entry))
      return entry.length <= 100 && entry.every((item) => visit(item, depth + 1, field));
    if (!entry || typeof entry !== 'object' || Object.getPrototypeOf(entry) !== Object.prototype)
      return false;
    const entries = Object.entries(entry);
    return (
      entries.length <= 100 &&
      entries.every(
        ([key, item]) =>
          safeKey(key) &&
          visit(
            item,
            depth + 1,
            IDENTIFIER_KEYS.has(key) || (field === 'contents' && key === 'id')
              ? 'identifier'
              : key === 'contents'
                ? 'contents'
                : undefined,
          ),
      )
    );
  };
  try {
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      visit(value, 0, undefined) &&
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
    // An empty item list carries no product, so Meta receives no content fields at all.
    ...(entries?.length
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
  const properties =
    input.name === 'product_view'
      ? normalizeProductView(parsed.data as ProductViewProperties)
      : (parsed.data as Record<string, unknown>);
  if (!isSafeEventProperties(properties)) return undefined;
  return { name: input.name, eventId, timestamp, properties };
}
/** The deprecated single-item shape becomes the commerce shape, so providers only see `items[]`. */
function normalizeProductView(data: ProductViewProperties): Record<string, unknown> {
  if (!('item_id' in data)) return data;
  const { item_id, item_name, price, item_category, item_brand, item_variant } = data;
  const items = data.items?.length
    ? data.items
    : [
        Object.fromEntries(
          Object.entries({
            item_id,
            item_name,
            price,
            item_category,
            item_brand,
            item_variant,
          }).filter(([, entry]) => entry !== undefined),
        ) as CommerceItem,
      ];
  const value = data.value ?? price;
  return {
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.currency !== undefined && value !== undefined ? { value } : {}),
    items,
  };
}
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
/** Malformed sections make the whole value malformed; absent sections are simply omitted. */
class MalformedContext extends Error {}
function section(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!plainObject(value)) throw new MalformedContext();
  return value;
}
function optionalField(value: unknown, valid: (entry: string) => boolean): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !valid(value)) throw new MalformedContext();
  return value;
}
function compact<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}
function httpUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
const validUserId = (value: string) => USER_ID.test(value);
/** Returns a copy holding only allowlisted identity fields, or `undefined` when malformed. */
export function sanitizeUserIdentity(value: unknown): UserIdentity | undefined {
  try {
    if (!plainObject(value)) return undefined;
    const id = optionalField(value.id, validUserId);
    if (id === undefined) return undefined;
    const customerType = optionalField(
      value.customerType,
      (entry) => entry === 'guest' || entry === 'registered',
    ) as CustomerType | undefined;
    return { id, ...(customerType ? { customerType } : {}) };
  } catch {
    return undefined;
  }
}
/**
 * Returns a copy holding only allowlisted context fields (unknown keys stripped, empty sections
 * omitted, `{}` when nothing remains), or `undefined` when the value is absent or malformed. Strict hashing, IP and user-agent checks for Meta user data remain the
 * server adapter's responsibility; this boundary only bounds shape and size.
 */
export function sanitizeEventContext(value: unknown): EventContext | undefined {
  try {
    const root = section(value);
    if (!root) return undefined;
    const page = section(root.page);
    const ga4 = section(root.ga4);
    const meta = section(root.meta);
    let userData: Record<string, string | string[]> | undefined;
    const rawUserData = section(meta?.userData);
    if (rawUserData) {
      const entries = Object.entries(rawUserData);
      if (entries.length > 20) throw new MalformedContext();
      userData = {};
      for (const [key, entry] of entries) {
        if (!/^[a-z][a-z0-9_]{0,31}$/.test(key) || UNSAFE_OBJECT_KEYS.has(key))
          throw new MalformedContext();
        const bounded = (item: unknown) => typeof item === 'string' && item.length <= 512;
        if (Array.isArray(entry)) {
          if (entry.length > 10 || !entry.every(bounded)) throw new MalformedContext();
          userData[key] = [...(entry as string[])];
        } else if (bounded(entry)) userData[key] = entry as string;
        else throw new MalformedContext();
      }
      if (!entries.length) userData = undefined;
    }
    const context = compact<EventContext>({
      page:
        page &&
        compact({
          location: optionalField(page.location, httpUrl),
          referrer: optionalField(page.referrer, httpUrl),
        }),
      ga4:
        ga4 &&
        compact({
          clientId: optionalField(ga4.clientId, (entry) => /^[A-Za-z0-9._-]{1,128}$/.test(entry)),
          sessionId: optionalField(ga4.sessionId, (entry) => /^\d{1,20}$/.test(entry)),
          userId: optionalField(ga4.userId, validUserId),
        }),
      meta:
        meta &&
        compact({
          userData,
          eventSourceUrl: optionalField(meta.eventSourceUrl, httpUrl),
        }),
    });
    return context ?? {};
  } catch {
    return undefined;
  }
}
