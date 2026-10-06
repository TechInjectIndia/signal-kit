'use client';
import Link from 'next/link';
import { useDemo } from '../shell';
export default function Catalog() {
  const { track } = useDemo();
  return (
    <section>
      <p className="eyebrow">02 / SAMPLE STORE</p>
      <h1>
        The everyday
        <br />
        field notebook.
      </h1>
      <p className="intro">
        One sample product, one event contract. Inspect the result in the activity panel.
      </p>
      <div className="product">
        <div className="notebook" aria-hidden="true">
          FIELD
          <br />
          NOTES<span>01—24</span>
        </div>
        <div>
          <h2>Field notebook</h2>
          <p>INR 450.00 · demonstration product</p>
          <button
            className="action"
            onClick={() =>
              void track({
                name: 'add_to_cart',
                properties: {
                  currency: 'INR',
                  value: 450,
                  items: [
                    { item_id: 'notebook', item_name: 'Field notebook', price: 450, quantity: 1 },
                  ],
                },
              })
            }
          >
            Add to cart +
          </button>
          <p>
            <Link href="/">← Back to the lab</Link>
          </p>
        </div>
      </div>
      <p className="note">
        Purchases must originate from verified server state. This button emits only an add_to_cart
        event.
      </p>
    </section>
  );
}
