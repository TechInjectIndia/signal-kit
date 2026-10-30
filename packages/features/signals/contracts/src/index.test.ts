import { describe, expect, it } from 'vitest';
import { sanitizeEvent } from './index.js';
describe('event boundary', () => {
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
  it('supports lead, search, auth, contact and custom action events (2.1)', () => {
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
  it('allows empty cart and empty checkout items (2.4)', () => {
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
      expect(res?.properties).toEqual({
        currency: 'USD',
        value: 0,
        items: [],
      });
    }
  });
});
