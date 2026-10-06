import type { EventInput } from '../src/index.js';
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
void [page, purchase, incomplete, identity, wrongQuantity];
