'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useDemo } from '../shell';

export default function Catalog() {
  const { track } = useDemo();
  const [cartCount, setCartCount] = useState(0);
  const [step, setStep] = useState<'browse' | 'cart' | 'checkout'>('browse');

  // Step 1: Product View (maps to view_item in GA4)
  const handleProductView = () => {
    void track({
      name: 'product_view',
      properties: {
        currency: 'INR',
        value: 450,
        items: [
          {
            item_id: 'notebook',
            item_name: 'Field notebook',
            price: 450,
            quantity: 1,
            item_category: 'Stationery',
          },
        ],
      },
    });
  };

  // Step 2: Add to Cart (maps to add_to_cart in GA4)
  const handleAddToCart = () => {
    const nextCount = cartCount + 1;
    setCartCount(nextCount);
    setStep('cart');
    void track({
      name: 'add_to_cart',
      properties: {
        currency: 'INR',
        value: 450 * nextCount,
        items: [
          {
            item_id: 'notebook',
            item_name: 'Field notebook',
            price: 450,
            quantity: nextCount,
            item_category: 'Stationery',
          },
        ],
      },
    });
  };

  // Step 3: Begin Checkout (maps to begin_checkout in GA4)
  const handleBeginCheckout = () => {
    setStep('checkout');
    void track({
      name: 'begin_checkout',
      properties: {
        currency: 'INR',
        value: 450 * (cartCount || 1),
        items: [
          {
            item_id: 'notebook',
            item_name: 'Field notebook',
            price: 450,
            quantity: cartCount || 1,
            item_category: 'Stationery',
          },
        ],
      },
    });
  };

  const item = (quantity: number) => ({
    item_id: 'notebook',
    item_name: 'Field notebook',
    price: 450,
    quantity,
    item_category: 'Stationery',
  });
  const cart = () => ({
    currency: 'INR',
    value: 450 * (cartCount || 1),
    items: [item(cartCount || 1)],
  });
  // Synthetic correlation values. The host owns and generates these; the SDK never invents them.
  const checkout = { checkout_id: 'chk_demo_0001', customer_type: 'guest' as const };

  const handleReset = () => {
    setCartCount(0);
    setStep('browse');
  };

  return (
    <section>
      <p className="eyebrow">02 / SAMPLE STORE · THREE-PROVIDER FUNNEL DEMO</p>
      <h1>
        The everyday
        <br />
        field notebook.
      </h1>
      <p className="intro">
        Interactive client funnel: <code>view_item</code> → <code>add_to_cart</code> →{' '}
        <code>begin_checkout</code>. Purchase requires verified server state.
      </p>

      {/* Funnel Progress Indicator */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          margin: '24px 0',
          fontSize: '12px',
          fontFamily: 'monospace',
        }}
      >
        <span
          style={{
            padding: '6px 10px',
            borderRadius: '4px',
            background: '#d3d8ce',
            color: '#1e302b',
          }}
        >
          1. View Product
        </span>
        <span
          style={{
            padding: '6px 10px',
            borderRadius: '4px',
            background: cartCount > 0 ? '#d9ef67' : '#e8ede5',
            color: '#1e302b',
          }}
        >
          2. Add to Cart {cartCount > 0 ? `(${cartCount})` : ''}
        </span>
        <span
          style={{
            padding: '6px 10px',
            borderRadius: '4px',
            background: step === 'checkout' ? '#d9ef67' : '#e8ede5',
            color: '#1e302b',
          }}
        >
          3. Checkout
        </span>
      </div>

      <div className="product">
        <div className="notebook" aria-hidden="true">
          FIELD
          <br />
          NOTES<span>01—24</span>
        </div>
        <div>
          <h2>Field notebook</h2>
          <p>INR 450.00 · demonstration product</p>

          {step === 'checkout' ? (
            <div
              style={{
                border: '1px solid #d3d8ce',
                padding: '18px',
                borderRadius: '4px',
                background: '#f4f1e9',
                maxWidth: '380px',
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>🛒 Checkout Stage</p>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', fontFamily: 'monospace' }}>
                Items: {cartCount || 1} x Field Notebook
                <br />
                Total: <strong>INR {450 * (cartCount || 1)}.00</strong>
              </p>
              <p style={{ fontSize: '13px' }}>
                This lab stops at checkout. A purchase must come from a verified server webhook.{' '}
                <a href="https://github.com/TechInjectIndia/signal-kit/blob/main/examples/bun/src/index.ts">
                  See the Bun signed-webhook example.
                </a>
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid #993c22',
                    color: '#993c22',
                    padding: '12px',
                    borderRadius: '4px',
                    font: '12px monospace',
                  }}
                  onClick={handleReset}
                >
                  Abandon Checkout (Drop-off)
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button className="action" onClick={handleAddToCart}>
                  Add to cart +
                </button>
                <button
                  style={{
                    border: '1px solid #1e302b',
                    borderRadius: '4px',
                    background: '#f4f1e9',
                    color: '#1e302b',
                    padding: '14px 18px',
                    font: '13px monospace',
                  }}
                  onClick={handleProductView}
                >
                  View Details (view_item)
                </button>
              </div>

              {cartCount > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    className="action"
                    style={{ background: '#1e302b', color: '#d9ef67' }}
                    onClick={handleBeginCheckout}
                  >
                    Proceed to Checkout ({cartCount} {cartCount === 1 ? 'item' : 'items'}) →
                  </button>
                </div>
              )}
            </div>
          )}

          <p style={{ marginTop: '24px' }}>
            <Link href="/">← Back to the lab</Link>
          </p>
        </div>
      </div>

      <p className="note">
        In real production stores, <code>product_view</code> fires on page load,{' '}
        <code>add_to_cart</code> on cart buttons, and <code>begin_checkout</code> on checkout entry.
        Purchases must originate from verified server state; see the Bun signed-webhook example
        above.
      </p>
      <h2>Cart and checkout events</h2>
      <p>
        Meta has no mapping for <code>remove_from_cart</code>, <code>view_cart</code> and{' '}
        <code>add_shipping_info</code>, so those report <code>skipped</code> there, not an error.
      </p>
      <div className="controls">
        <button
          onClick={() =>
            void track({
              name: 'remove_from_cart',
              properties: { currency: 'INR', value: 450, items: [item(1)] },
            })
          }
        >
          Remove from cart
        </button>
        <button onClick={() => void track({ name: 'view_cart', properties: cart() })}>
          View cart
        </button>
        <button
          onClick={() =>
            void track({
              name: 'add_shipping_info',
              properties: { ...cart(), ...checkout, shipping_tier: 'standard' },
            })
          }
        >
          Add shipping info
        </button>
        <button
          onClick={() =>
            void track({
              name: 'add_payment_info',
              properties: {
                ...cart(),
                ...checkout,
                payment_type: 'card',
                payment_attempt_id: 'pay_demo_0001',
              },
            })
          }
        >
          Add payment info
        </button>
        <button
          onClick={() =>
            void track({
              name: 'add_to_wishlist',
              properties: { currency: 'INR', value: 450, items: [item(1)] },
            })
          }
        >
          Add to wishlist
        </button>
      </div>
      <h2>Consumer-defined events</h2>
      <p>
        These definitions are registered once in the lab root. Only non-identifying choices leave
        the app.
      </p>
      <div className="controls">
        <button
          onClick={() => void track({ name: 'phone_click', properties: { channel: 'phone' } })}
        >
          Track phone contact
        </button>
        <button
          onClick={() =>
            void track({ name: 'whatsapp_click', properties: { channel: 'whatsapp' } })
          }
        >
          Track WhatsApp contact
        </button>
        <button
          onClick={() =>
            void track({
              name: 'custom_event',
              properties: { action: 'help_open', label: 'catalog_help' },
            })
          }
        >
          Track help opened
        </button>
      </div>
    </section>
  );
}
