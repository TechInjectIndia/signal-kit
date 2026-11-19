import { describe, expect, it } from 'vitest';
import {
  sanitizeEvent as parseEvent,
  createEventRegistry,
  defineEvent,
  getProviderEvent,
  isSafeEventProperties,
  sanitizeEventContext,
  sanitizeUserIdentity,
} from './index.js';
import { exampleEvents, z } from '../test/consumer-events.js';
const registry = createEventRegistry(exampleEvents);
const sanitizeEvent = (input: unknown, eventId: string) => parseEvent(input, eventId, registry);
describe('event boundary', () => {
  it('rejects consumer names unless registered', () => {
    for (const name of ['phone_click', 'whatsapp_click', 'custom_event']) {
      expect(
        parseEvent(
          { name, properties: { channel: 'phone', action: 'video_play' } },
          'unregistered',
        ),
      ).toBeUndefined();
    }
  });
  it('strips unknown customer fields and nested item metadata', () => {
    const result = sanitizeEvent(
      {
        name: 'purchase',
        properties: {
          transaction_id: 'order-1',
          value: 12,
          currency: 'INR',
          email: 'synthetic@example.invalid',
          items: [{ item_id: 'sku-1', phone: 'private' }],
        },
      },
      'event-1',
    );
    expect(result?.properties).toEqual({
      transaction_id: 'order-1',
      value: 12,
      currency: 'INR',
      items: [{ item_id: 'sku-1' }],
    });
  });
  it('rejects incomplete purchases and excessively large item lists', () => {
    expect(sanitizeEvent({ name: 'purchase', properties: { value: 1 } }, 'e')).toBeUndefined();
    expect(
      sanitizeEvent(
        {
          name: 'add_to_cart',
          properties: {
            value: 1,
            currency: 'USD',
            items: Array.from({ length: 101 }, () => ({ item_id: 'a' })),
          },
        },
        'e',
      ),
    ).toBeUndefined();
  });
  it('rejects a purchase with zero items', () => {
    expect(
      sanitizeEvent(
        {
          name: 'purchase',
          properties: { transaction_id: 'order-empty', currency: 'USD', value: 0, items: [] },
        },
        'purchase-empty',
      ),
    ).toBeUndefined();
  });
  it('strips page queries and rejects external URLs', () => {
    expect(
      sanitizeEvent(
        { name: 'page_view', properties: { page_path: '/cart?email=private#account' } },
        'e',
      )?.properties,
    ).toEqual({ page_path: '/cart' });
    expect(
      sanitizeEvent(
        { name: 'page_view', properties: { page_path: 'https://example.invalid' } },
        'e',
      ),
    ).toBeUndefined();
  });
  it('rejects nonfinite amounts and noninteger or out-of-range quantities', () => {
    for (const value of [Number.POSITIVE_INFINITY, Number.NaN, -1]) {
      expect(
        sanitizeEvent(
          {
            name: 'purchase',
            properties: {
              transaction_id: 'order-1',
              currency: 'INR',
              value,
              items: [{ item_id: 'sku-1' }],
            },
          },
          'e',
        ),
      ).toBeUndefined();
    }
    for (const quantity of [0, -1, 1.5, 100001]) {
      expect(
        sanitizeEvent(
          {
            name: 'add_to_cart',
            properties: { currency: 'INR', value: 1, items: [{ item_id: 'sku-1', quantity }] },
          },
          'e',
        ),
      ).toBeUndefined();
    }
  });
  it('supports predefined events and explicitly registered consumer definitions', () => {
    expect(
      sanitizeEvent(
        { name: 'generate_lead', properties: { value: 100, currency: 'USD', lead_type: 'quote' } },
        'lead-1',
      )?.properties,
    ).toEqual({ value: 100, currency: 'USD', lead_type: 'quote' });

    expect(
      sanitizeEvent({ name: 'search', properties: { search_term: 'sneakers' } }, 'search-1')
        ?.properties,
    ).toEqual({ search_term: 'sneakers' });

    expect(
      sanitizeEvent({ name: 'sign_up', properties: { method: 'google' } }, 'signup-1')?.properties,
    ).toEqual({ method: 'google' });

    expect(
      sanitizeEvent({ name: 'phone_click', properties: { channel: 'phone' } }, 'phone-1')
        ?.properties,
    ).toEqual({ channel: 'phone' });

    expect(
      sanitizeEvent(
        {
          name: 'custom_event',
          properties: { action: 'video_play', category: 'tutorial', value: 10 },
        },
        'custom-1',
      )?.properties,
    ).toEqual({ action: 'video_play', category: 'tutorial', value: 10 });
  });
  it('accepts only bounded, non-identifying custom event names', () => {
    expect(
      sanitizeEvent({ name: 'custom_event', properties: { action: `a${'b'.repeat(39)}` } }, 'ok'),
    ).toBeDefined();
    for (const action of [
      'CustomEvent',
      'video-play',
      '123start',
      'email@example',
      `a${'b'.repeat(40)}`,
    ]) {
      expect(
        sanitizeEvent({ name: 'custom_event', properties: { action } }, 'bad'),
      ).toBeUndefined();
    }
  });
  it('rejects email- and phone-like values from every free-text review field', () => {
    const unsafe = [
      { name: 'search', properties: { search_term: 'sample@example.invalid +1 (202) 555-0100' } },
      { name: 'search', properties: { search_term: 'sample%40example.invalid' } },
      { name: 'search', properties: { search_term: '%2B12025550100' } },
      { name: 'generate_lead', properties: { lead_type: 'call +1 (202) 555-0100' } },
      { name: 'sign_up', properties: { method: 'sample@example.invalid' } },
      { name: 'login', properties: { method: '2025550100' } },
      { name: 'custom_event', properties: { action: 'contact_2025550100' } },
      {
        name: 'custom_event',
        properties: { action: 'video_play', category: 'sample@example.invalid' },
      },
      {
        name: 'custom_event',
        properties: { action: 'video_play', label: 'call +1 (202) 555-0100' },
      },
    ];
    for (const input of unsafe) expect(sanitizeEvent(input, 'pii-test')).toBeUndefined();

    expect(
      sanitizeEvent({ name: 'search', properties: { search_term: 'iphone 15 pro' } }, 'safe-search')
        ?.properties,
    ).toEqual({ search_term: 'iphone 15 pro' });
  });
  it('strips raw identity fields from contact and commerce events', () => {
    for (const name of ['phone_click', 'whatsapp_click'] as const) {
      expect(
        sanitizeEvent(
          {
            name,
            properties: {
              channel: name === 'phone_click' ? 'phone' : 'whatsapp',
              phone_number: '+1234567890',
              destination: '+1234567890',
              user_id: 'customer-123',
            },
          },
          `${name}-1`,
        )?.properties,
      ).toEqual({ channel: name === 'phone_click' ? 'phone' : 'whatsapp' });
    }

    for (const name of ['product_view', 'add_to_cart', 'begin_checkout', 'purchase'] as const) {
      expect(
        sanitizeEvent(
          {
            name,
            properties: {
              ...(name === 'purchase' ? { transaction_id: 'order-1' } : {}),
              currency: 'USD',
              value: 10,
              items: [{ item_id: 'sku-1' }],
              phone_number: '+1234567890',
              destination: '+1234567890',
              user_id: 'customer-123',
            },
          },
          `${name}-1`,
        )?.properties,
      ).toEqual({
        ...(name === 'purchase' ? { transaction_id: 'order-1' } : {}),
        currency: 'USD',
        value: 10,
        items: [{ item_id: 'sku-1' }],
      });
    }
  });
  it('preserves standard ecommerce item and commerce properties (2.2)', () => {
    const res = sanitizeEvent(
      {
        name: 'purchase',
        properties: {
          transaction_id: 'ord-123',
          currency: 'USD',
          value: 120,
          shipping: 10,
          tax: 10,
          coupon: 'SUMMER',
          payment_type: 'card',
          items: [
            {
              item_id: 'sku-1',
              item_brand: 'BrandX',
              item_variant: 'Blue/L',
              discount: 5,
              coupon: 'ITEM5',
            },
          ],
        },
      },
      'purchase-1',
    );
    expect(res?.properties).toEqual({
      transaction_id: 'ord-123',
      currency: 'USD',
      value: 120,
      shipping: 10,
      tax: 10,
      coupon: 'SUMMER',
      payment_type: 'card',
      items: [
        {
          item_id: 'sku-1',
          item_brand: 'BrandX',
          item_variant: 'Blue/L',
          discount: 5,
          coupon: 'ITEM5',
        },
      ],
    });
  });
  it('accepts the deprecated single product view shape and normalises it to items[] (2.3)', () => {
    const res = sanitizeEvent(
      {
        name: 'product_view',
        properties: {
          item_id: 'prod-456',
          item_name: 'Running Shoes',
          price: 89.99,
          item_brand: 'Nike',
        },
      },
      'view-1',
    );
    expect(res?.properties).toEqual({
      items: [
        { item_id: 'prod-456', item_name: 'Running Shoes', price: 89.99, item_brand: 'Nike' },
      ],
    });
  });
  it('requires cart and checkout items but permits an empty product view', () => {
    for (const name of ['add_to_cart', 'begin_checkout'] as const) {
      const res = sanitizeEvent(
        {
          name,
          properties: {
            currency: 'USD',
            value: 0,
            items: [],
          },
        },
        `${name}-empty`,
      );
      expect(res).toBeUndefined();
    }
    expect(
      sanitizeEvent(
        { name: 'product_view', properties: { currency: 'USD', value: 0, items: [] } },
        'product-view-empty',
      )?.properties,
    ).toEqual({ currency: 'USD', value: 0, items: [] });
  });
  it('rejects negative custom values and accepts zero', () => {
    expect(
      sanitizeEvent(
        { name: 'custom_event', properties: { action: 'video_play', value: -1 } },
        'custom-negative',
      ),
    ).toBeUndefined();
    expect(
      sanitizeEvent(
        { name: 'custom_event', properties: { action: 'video_play', value: 0 } },
        'custom-zero',
      )?.properties,
    ).toEqual({ action: 'video_play', value: 0 });
  });
});

const commerce = { currency: 'USD', value: 10, items: [{ item_id: 'sku-1', price: 10 }] };
const listItems = [
  { item_id: 'sku-1', index: 0, item_list_id: 'list-1', item_list_name: 'Featured' },
  { item_id: 'sku-2', index: 1 },
];
/** [event, valid properties, GA4 name, Meta name and mode, or undefined when Meta has no mapping]. */
const MATRIX = [
  ['page_view', { page_path: '/' }, 'page_view', ['PageView', 'standard']],
  ['product_view', commerce, 'view_item', ['ViewContent', 'standard']],
  ['add_to_cart', commerce, 'add_to_cart', ['AddToCart', 'standard']],
  ['begin_checkout', commerce, 'begin_checkout', ['InitiateCheckout', 'standard']],
  ['purchase', { ...commerce, transaction_id: 'order-1' }, 'purchase', ['Purchase', 'standard']],
  ['generate_lead', { lead_type: 'quote' }, 'generate_lead', ['Lead', 'standard']],
  ['search', { search_term: 'notebook' }, 'search', ['Search', 'standard']],
  ['sign_up', { method: 'password' }, 'sign_up', ['CompleteRegistration', 'standard']],
  ['login', { method: 'password' }, 'login', ['Login', 'custom']],
  ['remove_from_cart', commerce, 'remove_from_cart', undefined],
  ['view_cart', commerce, 'view_cart', undefined],
  ['add_shipping_info', commerce, 'add_shipping_info', undefined],
  ['add_payment_info', commerce, 'add_payment_info', ['AddPaymentInfo', 'standard']],
  ['refund', { transaction_id: 'order-1' }, 'refund', undefined],
  ['view_item_list', { items: listItems }, 'view_item_list', undefined],
  ['select_item', { items: [listItems[0]] }, 'select_item', undefined],
  ['add_to_wishlist', commerce, 'add_to_wishlist', ['AddToWishlist', 'standard']],
] as const;

describe('contract evidence: predefined mapping matrix', () => {
  it('covers all seventeen predefined events', () => {
    expect(new Set(MATRIX.map(([name]) => name)).size).toBe(17);
  });
  for (const [name, properties, ga4, meta] of MATRIX) {
    it(`${name} validates and resolves GA4, Meta and Clarity per the table`, () => {
      const event = parseEvent({ name, properties }, `${name}-1`)!;
      expect(event).toBeDefined();
      expect(getProviderEvent(event, 'ga4')).toMatchObject({ family: 'ga4', name: ga4 });
      expect(getProviderEvent(event, 'ga4')).not.toHaveProperty('mode');
      if (meta)
        expect(getProviderEvent(event, 'meta')).toMatchObject({ name: meta[0], mode: meta[1] });
      else expect(() => getProviderEvent(event, 'meta')).toThrow('event_mapping_missing');
      expect(getProviderEvent(event, 'clarity')).toEqual({
        family: 'clarity',
        name,
        properties: {},
      });
    });
  }
  it('passes item list properties, including item index, to GA4 unchanged', () => {
    const event = parseEvent(
      { name: 'view_item_list', properties: { item_list_id: 'home', items: listItems } },
      'list-1',
    )!;
    expect(getProviderEvent(event, 'ga4').properties).toEqual({
      item_list_id: 'home',
      items: listItems,
    });
  });
  it('converts add_payment_info and add_to_wishlist items to Meta contents', () => {
    for (const name of ['add_payment_info', 'add_to_wishlist'] as const) {
      const event = parseEvent({ name, properties: commerce }, `${name}-meta`)!;
      expect(getProviderEvent(event, 'meta').properties).toMatchObject({
        content_type: 'product',
        content_ids: ['sku-1'],
        contents: [{ id: 'sku-1', quantity: 1, item_price: 10 }],
      });
      expect(getProviderEvent(event, 'meta').properties).not.toHaveProperty('items');
    }
  });
});

describe('contract evidence: product_view normalisation', () => {
  const item = { item_id: 'sku-9', item_name: 'Lamp', price: 25, item_category: 'home' };
  const shapes = {
    single: { ...item, currency: 'USD' },
    'single with items': { ...item, currency: 'USD', items: [{ item_id: 'sku-a' }] },
    commerce: { currency: 'USD', value: 25, items: [{ item_id: 'sku-9' }] },
    'commerce with empty items': { currency: 'USD', value: 0, items: [] },
  };
  for (const [shape, properties] of Object.entries(shapes)) {
    it(`${shape}: providers never see top-level item fields`, () => {
      const event = parseEvent({ name: 'product_view', properties }, 'pv-1')!;
      expect(event).toBeDefined();
      const ga4 = getProviderEvent(event, 'ga4').properties;
      const meta = getProviderEvent(event, 'meta').properties;
      for (const key of ['item_id', 'item_name', 'price', 'item_category'])
        expect(ga4).not.toHaveProperty(key);
      if (shape === 'commerce with empty items') {
        expect(ga4.items).toEqual([]);
        for (const key of ['content_type', 'content_ids', 'contents'])
          expect(meta).not.toHaveProperty(key);
      } else {
        expect((ga4.items as unknown[]).length).toBeGreaterThanOrEqual(1);
        expect(meta.content_ids).toEqual(
          (ga4.items as { item_id: string }[]).map((i) => i.item_id),
        );
      }
    });
  }
  it('builds one item from the single shape and uses price as value only with a currency', () => {
    expect(
      parseEvent({ name: 'product_view', properties: shapes.single }, 'pv')?.properties,
    ).toEqual({ currency: 'USD', value: 25, items: [item] });
    expect(
      parseEvent({ name: 'product_view', properties: { ...item, value: 30 } }, 'pv')?.properties,
    ).toEqual({ items: [item] });
    expect(
      parseEvent(
        { name: 'product_view', properties: { ...item, currency: 'USD', value: 20 } },
        'pv',
      )?.properties,
    ).toEqual({ currency: 'USD', value: 20, items: [item] });
  });
  it('prefers an explicit items list over the top-level item', () => {
    expect(
      parseEvent({ name: 'product_view', properties: shapes['single with items'] }, 'pv')
        ?.properties,
    ).toEqual({ currency: 'USD', value: 25, items: [{ item_id: 'sku-a' }] });
  });
  it('keeps accepting the commerce shape with an empty item list (O3)', () => {
    expect(
      parseEvent({ name: 'product_view', properties: shapes['commerce with empty items'] }, 'pv')
        ?.properties,
    ).toEqual({ currency: 'USD', value: 0, items: [] });
  });
});

describe('contract evidence: checkout correlation and new event schemas', () => {
  const correlation = { checkout_id: 'chk_01HX', customer_type: 'guest' };
  it('keeps correlation fields on the events that declare them', () => {
    const cases = [
      ['begin_checkout', { ...commerce, ...correlation }],
      ['add_shipping_info', { ...commerce, ...correlation, shipping_tier: 'express' }],
      ['add_payment_info', { ...commerce, ...correlation, payment_attempt_id: 'pay_1' }],
      [
        'purchase',
        { ...commerce, ...correlation, transaction_id: 'order-1', payment_attempt_id: 'pay_1' },
      ],
    ] as const;
    for (const [name, properties] of cases) {
      const event = parseEvent({ name, properties }, `${name}-c`)!;
      expect(event.properties).toEqual(properties);
      expect(getProviderEvent(event, 'ga4').properties).toMatchObject(correlation);
      if (name !== 'add_shipping_info')
        expect(getProviderEvent(event, 'meta').properties).toMatchObject(correlation);
    }
  });
  it('strips correlation fields from events that do not declare them', () => {
    const extra = { ...correlation, payment_attempt_id: 'pay_1', shipping_tier: 'express' };
    for (const name of ['add_to_cart', 'remove_from_cart', 'view_cart', 'add_to_wishlist'])
      expect(parseEvent({ name, properties: { ...commerce, ...extra } }, 'x')?.properties).toEqual(
        commerce,
      );
    expect(
      parseEvent({ name: 'begin_checkout', properties: { ...commerce, ...extra } }, 'x')
        ?.properties,
    ).toEqual({ ...commerce, ...correlation });
  });
  it('rejects contact details in shipping_tier and unknown customer types', () => {
    for (const shipping_tier of ['a@b.co', 'call 202 555 0100'])
      expect(
        parseEvent({ name: 'add_shipping_info', properties: { ...commerce, shipping_tier } }, 'x'),
      ).toBeUndefined();
    expect(
      parseEvent(
        { name: 'begin_checkout', properties: { ...commerce, customer_type: 'vip' } },
        'x',
      ),
    ).toBeUndefined();
  });
  it('requires a currency whenever a refund carries a value', () => {
    expect(
      parseEvent({ name: 'refund', properties: { transaction_id: 'order-1', value: 5 } }, 'r'),
    ).toBeUndefined();
    expect(
      parseEvent({ name: 'refund', properties: { transaction_id: 'order-1' } }, 'r')?.properties,
    ).toEqual({ transaction_id: 'order-1' });
    const partial = {
      transaction_id: 'order-1',
      currency: 'USD',
      value: 5,
      items: [{ item_id: 'sku-1', quantity: 1 }],
    };
    expect(parseEvent({ name: 'refund', properties: partial }, 'r')?.properties).toEqual(partial);
  });
  it('requires 1..100 items for list events and bounds item index', () => {
    for (const name of ['view_item_list', 'select_item']) {
      expect(parseEvent({ name, properties: { items: [] } }, 'l')).toBeUndefined();
      expect(
        parseEvent({ name, properties: { items: [{ item_id: 'a', index: 10001 }] } }, 'l'),
      ).toBeUndefined();
      expect(
        parseEvent({ name, properties: { items: [{ item_id: 'a', index: 1.5 }] } }, 'l'),
      ).toBeUndefined();
    }
  });
  it('reserves the new SDK names and their provider names for consumer events', () => {
    const schema = z.object({ sku: z.string() });
    expect(() =>
      defineEvent({ name: 'remove_from_cart', schema, map: { clarity: { name: 'x_removed' } } }),
    ).toThrow();
    expect(() =>
      defineEvent({
        name: 'wishlist_item_added',
        schema,
        map: { meta: { name: 'AddToWishlist', mode: 'standard', properties: { sku: 'sku' } } },
      }),
    ).toThrow();
    expect(() =>
      defineEvent({
        name: 'payment_step',
        schema,
        map: { ga4: { name: 'add_payment_info', properties: { sku: 'sku' } } },
      }),
    ).toThrow();
    expect(() =>
      defineEvent({
        name: 'payment_step',
        schema,
        map: { meta: { name: 'AddPaymentInfo', mode: 'standard', properties: { sku: 'sku' } } },
      }),
    ).toThrow();
  });
});

describe('contract evidence: identifier PII rule (O1)', () => {
  const purchase = (transaction_id: string, item_id = 'sku-1') => ({
    name: 'purchase',
    properties: { currency: 'USD', value: 1, transaction_id, items: [{ item_id }] },
  });
  it('accepts long numeric and structured identifiers in identifier fields', () => {
    for (const id of ['ORD-2026-0001234567', '1731912345678'])
      expect(parseEvent(purchase(id), 'id')?.properties.transaction_id).toBe(id);
    const event = parseEvent(purchase('order-1', '8901234567890'), 'id')!;
    expect(event.properties.items).toEqual([{ item_id: '8901234567890' }]);
    const meta = getProviderEvent(event, 'meta').properties;
    expect(meta).toMatchObject({ order_id: 'order-1', content_ids: ['8901234567890'] });
    expect(
      parseEvent(
        {
          name: 'add_payment_info',
          properties: { ...commerce, checkout_id: '17319123456', payment_attempt_id: '9876543210' },
        },
        'id',
      ),
    ).toBeDefined();
  });
  it('still rejects email-like, +-prefixed, spaced and formatted phone values in identifier fields', () => {
    for (const id of [
      'a@b.co',
      'a%40b.co',
      '+91 98765 43210',
      '+919876543210',
      '%2B919876543210',
      '98765 43210',
      '(202)5550100',
      '202-555-0100',
      '1.202.555.0100',
    ]) {
      expect(parseEvent(purchase(id), 'id')).toBeUndefined();
      expect(parseEvent(purchase('order-1', id), 'id')).toBeUndefined();
    }
  });
  it('keeps the full phone heuristic for free-text fields', () => {
    expect(
      parseEvent({ name: 'search', properties: { search_term: '9876543210' } }, 's'),
    ).toBeUndefined();
    expect(
      parseEvent({ name: 'search', properties: { search_term: '+91 98765 43210' } }, 's'),
    ).toBeUndefined();
    expect(
      parseEvent(
        { name: 'purchase', properties: { ...purchase('o-1').properties, coupon: '9876543210' } },
        'c',
      ),
    ).toBeUndefined();
    expect(
      parseEvent(
        {
          name: 'view_item_list',
          properties: { item_list_name: '9876543210', items: [{ item_id: 'a' }] },
        },
        'c',
      ),
    ).toBeUndefined();
  });
  it('applies the identifier rule to Meta contents ids but not to other nested id keys', () => {
    expect(isSafeEventProperties({ contents: [{ id: '8901234567890', quantity: 1 }] })).toBe(true);
    expect(isSafeEventProperties({ contents: [{ id: 'a@b.co' }] })).toBe(false);
    expect(isSafeEventProperties({ other: [{ id: '8901234567890' }] })).toBe(false);
    expect(isSafeEventProperties({ label: '8901234567890' })).toBe(false);
  });
});

describe('contract evidence: sanitizeUserIdentity', () => {
  it('accepts an opaque host key and an optional customer type', () => {
    expect(sanitizeUserIdentity({ id: 'cus_8f3a' })).toEqual({ id: 'cus_8f3a' });
    expect(
      sanitizeUserIdentity({ id: 'cus:8f3a.v2-x', customerType: 'registered', email: 'x' }),
    ).toEqual({ id: 'cus:8f3a.v2-x', customerType: 'registered' });
  });
  it('rejects malformed identities without throwing', () => {
    for (const value of [
      undefined,
      null,
      'cus_8f3a',
      [],
      {},
      { id: 'sample@example.invalid' },
      { id: 'a'.repeat(129) },
      { id: 'cus 8f3a' },
      { id: '+919876543210' },
      { id: '_leading' },
      { id: 42 },
      { id: 'cus_1', customerType: 'vip' },
    ])
      expect(sanitizeUserIdentity(value)).toBeUndefined();
    expect(sanitizeUserIdentity({ id: 'a'.repeat(128) })).toBeDefined();
  });
});

describe('contract evidence: sanitizeEventContext', () => {
  const valid = {
    page: { location: 'https://shop.example/p/1?x=1', referrer: 'http://ref.example/' },
    ga4: { clientId: '123.456', sessionId: '1731912345', userId: 'cus_8f3a' },
    meta: {
      userData: { em: 'a'.repeat(64), fbp: 'fb.1.1.1', external_id: ['b'.repeat(64)] },
      eventSourceUrl: 'https://shop.example/checkout',
    },
  };
  it('keeps allowlisted fields and strips unknown keys', () => {
    expect(
      sanitizeEventContext({
        ...valid,
        extra: 'x',
        page: { ...valid.page, title: 'x' },
        ga4: { ...valid.ga4, debug: true },
        meta: { ...valid.meta, pixelId: '1' },
      }),
    ).toEqual(valid);
    expect(sanitizeEventContext({ ga4: {}, unknown: 1 })).toEqual({});
    expect(sanitizeEventContext(undefined)).toBeUndefined();
  });
  it('rejects non-http URLs and malformed GA4 identifiers', () => {
    for (const value of [
      { page: { location: 'javascript:alert(1)' } },
      { page: { referrer: 'ftp://files.example/' } },
      { page: { location: `https://a.example/${'x'.repeat(2048)}` } },
      { page: { location: '/relative' } },
      { meta: { eventSourceUrl: 'data:text/plain,x' } },
      { ga4: { clientId: 'has space' } },
      { ga4: { sessionId: 'abc' } },
      { ga4: { sessionId: '1'.repeat(21) } },
      { ga4: { userId: 'sample@example.invalid' } },
      { page: 'https://shop.example/' },
      'context',
      [],
    ])
      expect(sanitizeEventContext(value)).toBeUndefined();
  });
  it('bounds meta.userData keys, values and arrays', () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']));
    for (const userData of [
      many,
      { em: 'x'.repeat(513) },
      { em: Array.from({ length: 11 }, () => 'v') },
      { em: [1] },
      { em: 1 },
      { 'Bad-Key': 'v' },
      { constructor: 'v' },
    ])
      expect(sanitizeEventContext({ meta: { userData } })).toBeUndefined();
    const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 'v']));
    expect(sanitizeEventContext({ meta: { userData: twenty } })?.meta?.userData).toEqual(twenty);
  });
  it('returns a copy that does not alias caller arrays', () => {
    const external_id = ['b'.repeat(64)];
    const context = sanitizeEventContext({ meta: { userData: { external_id } } })!;
    external_id.push('mutated');
    expect(context.meta?.userData?.external_id).toEqual(['b'.repeat(64)]);
  });
});
