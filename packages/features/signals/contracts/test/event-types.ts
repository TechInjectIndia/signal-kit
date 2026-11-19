import { exampleEvents } from './consumer-events.js';
type ContactProperties = Extract<
  RegisteredEventInput<typeof exampleEvents>,
  { name: 'phone_click' }
>['properties'];
import type {
  CommerceProperties,
  DispatchResult,
  DispatchStatus,
  EventContext,
  EventInput,
  EventName,
  Provider,
  RegisteredEventInput,
  SignalEvent,
  TrackOptions,
  UserIdentity,
} from '../src/index.js';
const page: EventInput = { name: 'page_view', properties: { page_path: '/' } };
const purchase: EventInput = {
  name: 'purchase',
  properties: {
    transaction_id: 'order-1',
    currency: 'INR',
    value: 10,
    items: [{ item_id: 'sku-1' }],
  },
};
// @ts-expect-error A purchase requires a verified transaction identifier.
const incomplete: EventInput = {
  name: 'purchase',
  properties: { currency: 'INR', value: 10, items: [{ item_id: 'sku-1' }] },
};
const identity: EventInput = {
  name: 'page_view',
  // @ts-expect-error Arbitrary identity properties are excluded from the public event contract.
  properties: { page_path: '/', email: 'synthetic@example.invalid' },
};
const wrongQuantity: EventInput = {
  name: 'add_to_cart',
  // @ts-expect-error Quantity is numeric.
  properties: { currency: 'INR', value: 10, items: [{ item_id: 'sku-1', quantity: 'one' }] },
};
const unsafeCommerce: CommerceProperties = {
  currency: 'INR',
  value: 10,
  items: [{ item_id: 'sku-1' }],
  // @ts-expect-error Raw user identifiers are excluded from commerce properties.
  user_id: 'customer-1',
};
const unsafePhone: ContactProperties = {
  // @ts-expect-error Raw phone numbers are excluded from contact properties.
  phone_number: '+1234567890',
};
const unsafeDestination: ContactProperties = {
  // @ts-expect-error Raw destinations are excluded from contact properties.
  destination: '+1234567890',
};
const commerce = { currency: 'INR', value: 10, items: [{ item_id: 'sku-1' }] };
const newEvents: EventInput[] = [
  { name: 'remove_from_cart', properties: commerce },
  { name: 'view_cart', properties: commerce },
  { name: 'add_to_wishlist', properties: commerce },
  {
    name: 'begin_checkout',
    properties: { ...commerce, checkout_id: 'chk_1', customer_type: 'guest' },
  },
  { name: 'add_shipping_info', properties: { ...commerce, shipping_tier: 'express' } },
  {
    name: 'add_payment_info',
    properties: { ...commerce, payment_type: 'card', payment_attempt_id: 'pay_1' },
  },
  {
    name: 'purchase',
    properties: {
      ...commerce,
      transaction_id: 'order-1',
      checkout_id: 'chk_1',
      payment_attempt_id: 'pay_1',
      customer_type: 'registered',
    },
  },
  { name: 'refund', properties: { transaction_id: 'order-1' } },
  {
    name: 'view_item_list',
    properties: { item_list_id: 'home', items: [{ item_id: 'sku-1', index: 0 }] },
  },
  { name: 'select_item', properties: { items: [{ item_id: 'sku-1', item_list_name: 'Home' }] } },
  { name: 'product_view', properties: { item_id: 'sku-1', price: 10 } },
];
const attemptOnCheckout: EventInput = {
  name: 'begin_checkout',
  // @ts-expect-error payment_attempt_id is not declared on begin_checkout.
  properties: { ...commerce, payment_attempt_id: 'pay_1' },
};
const checkoutOnCart: EventInput = {
  name: 'add_to_cart',
  // @ts-expect-error checkout_id is not declared on add_to_cart.
  properties: { currency: 'INR', value: 10, items: [{ item_id: 'sku-1' }], checkout_id: 'chk_1' },
};
const vipCustomer: EventInput = {
  name: 'begin_checkout',
  // @ts-expect-error customer_type is limited to guest or registered.
  properties: { ...commerce, customer_type: 'vip' },
};
// @ts-expect-error A refund requires the original transaction identifier.
const refundWithoutTransaction: EventInput = { name: 'refund', properties: { value: 1 } };
const allNames: Record<EventName, true> = {
  page_view: true,
  product_view: true,
  add_to_cart: true,
  begin_checkout: true,
  purchase: true,
  generate_lead: true,
  sign_up: true,
  login: true,
  search: true,
  remove_from_cart: true,
  view_cart: true,
  add_shipping_info: true,
  add_payment_info: true,
  refund: true,
  view_item_list: true,
  select_item: true,
  add_to_wishlist: true,
};
const skipped: DispatchStatus = 'skipped';
const outcome: DispatchResult['outcomes'][number] = {
  provider: 'ga4',
  status: 'skipped',
  reason: 'event_mapping_missing',
};
const user: UserIdentity = { id: 'cus_8f3a', customerType: 'registered' };
// @ts-expect-error Identity carries an opaque key only, never contact details.
const userWithEmail: UserIdentity = { id: 'cus_8f3a', email: 'synthetic@example.invalid' };
// @ts-expect-error Pixel external_id matching is deferred and not part of the identity contract.
const userWithHash: UserIdentity = { id: 'cus_8f3a', metaExternalIdHash: 'a'.repeat(64) };
const context: EventContext = {
  page: { location: 'https://shop.example/' },
  ga4: { clientId: '1.2', sessionId: '3' },
  meta: { userData: { em: ['hash'] }, eventSourceUrl: 'https://shop.example/' },
};
const options: TrackOptions = { categories: ['marketing'], context };
const provider: Provider = {
  name: 'hooks',
  category: 'analytics',
  send(event: SignalEvent) {
    void [event.context?.page?.location, event.consent?.analytics];
  },
  prepare: async () => undefined,
  setUser(next) {
    void next?.id;
  },
  identifiers: () => ({ client_id: '1.2' }),
};
void [
  newEvents,
  attemptOnCheckout,
  checkoutOnCart,
  vipCustomer,
  refundWithoutTransaction,
  allNames,
  skipped,
  outcome,
  user,
  userWithEmail,
  userWithHash,
  options,
  provider,
];
void [
  page,
  purchase,
  incomplete,
  identity,
  wrongQuantity,
  unsafeCommerce,
  unsafePhone,
  unsafeDestination,
];
