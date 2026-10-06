# Verified purchase tracking in Next.js — SignalKit guide

By SignalKit maintainers · 2026-10-06

Track purchases from verified order state in Next.js, preserve event IDs across browser and server copies, and test consent and durable retries locally.

Public route: https://techinjectindia.github.io/signal-kit/guides/nextjs-purchase-tracking/

## Why a checkout success page is insufficient

A redirect can be replayed, interrupted or visited without a captured payment. Treat it as presentation, not an authoritative purchase trigger. A trusted server must verify the payment notification, match the order amount and currency, and persist paid state before creating a purchase event.

SignalKit accepts typed telemetry; it does not verify your payment or persist your orders. The included Bun lab demonstrates a signed Razorpay webhook and SQLite outbox using synthetic orders. It is a reference for the trust boundary, not a production payment service.

## Run the existing complete example

Use Node 22, pnpm 10.24.0 and Bun 1.3.4. Start both hosts in separate terminals. The Next lab and Bun fixture let you inspect denied consent, permitted events and verified synthetic payment replay without real provider credentials.

```sh
git clone --branch main https://github.com/TechInjectIndia/signal-kit.git
cd signal-kit
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @signalkit/example-nextjs dev
# In another terminal from repository root:
pnpm --filter @signalkit/example-bun dev
```

## Send a trusted event after order verification

Use this event shape in the verified-payment branch of your server handler. The values below illustrate a trusted persisted order. Generate eventId once when the host creates its durable delivery record, then reuse it on every attempt. Persist transaction_id, currency, value and line items from the trusted order, rather than taking them from the browser.

```ts
await signals.track({
  name: 'purchase',
  eventId: persistedOrder.eventId,
  properties: {
    transaction_id: persistedOrder.id,
    currency: 'INR',
    value: 450,
    items: [{ item_id: 'notebook', price: 450, quantity: 1 }],
  },
});
```

## Connect the Next.js browser provider

Place a client provider around your root layout children. Start with denied permissions, then apply the user’s real persisted choice through useSignals().setConsent. Events dropped before consent are not replayed. Parent configuration must remain consistent with the current consent state.

```ts
'use client';
import { SignalKitProvider, createGA4Provider } from '@techinject/nextjs';

const config = {
  providers: [createGA4Provider({ measurementId: 'G-YOURID' })],
  consent: { analytics: false, marketing: false, observability: false },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return <SignalKitProvider config={config}>{children}</SignalKitProvider>;
}
```

- Send a browser purchase copy only after your server returns the verified order state and persisted event ID to an authorized customer.
- Avoid adding email, address or other customer identifiers to commerce fields.
- Disable GA4 Enhanced Measurement automatic history page changes when SignalKit sends explicit pages.
- Do not silently set all consent categories to true to make the demo produce events.

## Make retries a host responsibility

Write a delivery record transactionally with your order transition. A host worker can retry transient provider errors using the same event ID. Decide which diagnostic outcomes allow the outbox to mark a provider copy complete; a timed-out transport is not proof that the destination received nothing.

An in-memory telemetry call is best effort. SignalKit’s pending limits and timeouts protect host responses, but they are not a durable queue. Your host supplies crash recovery, replay protection, per-customer consent and a retention policy.

## What should you test before production?

Replay a signed captured-payment fixture twice and verify the same persisted purchase ID. Reject altered signatures, mismatched amount/currency and unpaid state. Simulate a timeout between provider acceptance and acknowledgement. Confirm denied consent does not dispatch, and inspect accepted events in your own provider account before claiming live attribution.

The repository’s local tests establish fixture behavior. They do not establish that GA4 or Meta attributed a real customer purchase. No npm install command is offered while packages remain unpublished.

[Next.js instrumentation reference](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation) · [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/)
