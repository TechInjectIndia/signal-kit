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
  | 'purchase';
export type CommerceItem = {
  item_id: string;
  item_name?: string;
  price?: number;
  quantity?: number;
  item_category?: string;
};
export type CommerceProperties = { currency: string; value: number; items: CommerceItem[] };
export type PurchaseProperties = CommerceProperties & { transaction_id: string };
export type PageViewProperties = { page_path: string };
type EventIdentity = { eventId?: string; timestamp?: number };
export type EventInput = EventIdentity &
  (
    | { name: 'page_view'; properties: PageViewProperties }
    | { name: 'product_view' | 'add_to_cart' | 'begin_checkout'; properties: CommerceProperties }
    | { name: 'purchase'; properties: PurchaseProperties }
  );
export type SignalEvent = {
  name: EventName;
  eventId: string;
  timestamp: number;
  properties: Record<string, unknown>;
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
const amount = number().check(nonnegative());
const currency = string().check(regex(/^[A-Z]{3}$/));
const item = object({
  item_id: text,
  item_name: optional(text),
  price: optional(amount),
  quantity: optional(int().check(positive(), maximum(100000))),
  item_category: optional(text),
});
const commerce = object({
  currency,
  value: amount,
  items: array(item).check(minLength(1), maxLength(100)),
});
const schemas = {
  page_view: object({ page_path: string().check(minLength(1), maxLength(2048)) }),
  product_view: commerce,
  add_to_cart: commerce,
  begin_checkout: commerce,
  purchase: extend(commerce, { transaction_id: text }),
};
/** Unknown fields are stripped; request URLs, identity, and arbitrary metadata never pass through. */
export function sanitizeEvent(value: unknown, eventId: string): SignalEvent | undefined {
  const input = value as EventInput;
  if (!input || typeof input !== 'object' || !Object.hasOwn(schemas, input.name)) return undefined;
  if (!/^[\w.-]{1,128}$/.test(eventId)) return undefined;
  const timestamp = input.timestamp ?? Date.now();
  if (!Number.isFinite(timestamp) || timestamp < 0) return undefined;
  const parsed = schemas[input.name].safeParse(input.properties);
  if (!parsed.success) return undefined;
  if (input.name === 'page_view') {
    const properties = parsed.data as { page_path: string };
    // Only local paths may be supplied; strip potential query and fragment identifiers.
    if (!properties.page_path.startsWith('/') || properties.page_path.startsWith('//'))
      return undefined;
    properties.page_path = properties.page_path.split(/[?#]/)[0] ?? '/';
  }
  return { name: input.name, eventId, timestamp, properties: parsed.data };
}
