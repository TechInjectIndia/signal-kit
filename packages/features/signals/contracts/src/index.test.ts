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
});
