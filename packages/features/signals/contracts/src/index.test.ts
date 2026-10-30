import { describe, expect, it } from 'vitest';
import { sanitizeEvent as parseEvent, createEventRegistry, getProviderEvent } from './index.js';
import { exampleEvents } from '../test/consumer-events.js';
const registry = createEventRegistry(exampleEvents);
const sanitizeEvent = (input: unknown, eventId: string) => parseEvent(input, eventId, registry);
describe('event boundary', () => {
  it('validates all nine predefined contracts and resolves each provider mapping', () => {
    const commerce = { currency: 'USD', value: 10, items: [{ item_id: 'sku-1' }] };
    for (const [name, properties, ga4, meta] of [
      ['page_view', { page_path: '/' }, 'page_view', 'PageView'],
      ['product_view', commerce, 'view_item', 'ViewContent'],
      ['add_to_cart', commerce, 'add_to_cart', 'AddToCart'],
      ['begin_checkout', commerce, 'begin_checkout', 'InitiateCheckout'],
      ['purchase', { ...commerce, transaction_id: 'order-1' }, 'purchase', 'Purchase'],
      ['generate_lead', { lead_type: 'quote' }, 'generate_lead', 'Lead'],
      ['search', { search_term: 'notebook' }, 'search', 'Search'],
      ['sign_up', { method: 'password' }, 'sign_up', 'CompleteRegistration'],
      ['login', { method: 'password' }, 'login', 'Login'],
    ] as const) {
      const event = parseEvent({ name, properties }, 'predefined-1')!;
      expect(event).toBeDefined();
      expect(getProviderEvent(event, 'ga4').name).toBe(ga4);
      expect(getProviderEvent(event, 'meta')).toMatchObject({
        name: meta,
        mode: name === 'login' ? 'custom' : 'standard',
      });
      expect(getProviderEvent(event, 'clarity')).toMatchObject({ name, properties: {} });
    }
  });
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
  it('allows single product view without full cart structure (2.3)', () => {
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
      item_id: 'prod-456',
      item_name: 'Running Shoes',
      price: 89.99,
      item_brand: 'Nike',
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
