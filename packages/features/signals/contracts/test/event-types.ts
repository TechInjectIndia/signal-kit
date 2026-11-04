import { exampleEvents } from './consumer-events.js';
type ContactProperties = Extract<
  RegisteredEventInput<typeof exampleEvents>,
  { name: 'phone_click' }
>['properties'];
import type { CommerceProperties, EventInput, RegisteredEventInput } from '../src/index.js';
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
