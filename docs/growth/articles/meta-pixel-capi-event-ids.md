# Share Meta Pixel and CAPI event IDs — SignalKit guide

By SignalKit maintainers · 2026-10-06

Use a persisted purchase event ID for Meta Pixel and CAPI copies, keep access tokens server-only, and distinguish payload checks from live deduplication.

Public route: https://techinjectindia.github.io/signal-kit/guides/meta-pixel-capi-event-ids/

## Give one purchase one stable event ID

A browser Pixel copy and server Conversions API copy describe the same purchase. SignalKit maps purchase to Meta Purchase in both adapters and places your eventId into the corresponding provider field. The host must supply the same value in both copies.

Keep four identities separate: transaction_id identifies the trusted order, eventId identifies this purchase occurrence, a trace ID describes a request chain, and an optional session identifier describes a visit. A retried payment webhook may create a new trace, but its purchase event ID must remain stable.

## Inspect the runnable fixture first

Clone and build the workspace, then run its Next.js and Bun labs. The local inspector shows dispatched event names and IDs; fixtures exercise provider command and payload shapes without live attribution claims.

```sh
git clone --branch main https://github.com/TechInjectIndia/signal-kit.git
cd signal-kit
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @signalkit/example-nextjs dev
# In another terminal from repository root:
pnpm --filter @signalkit/example-bun dev
```

## Configure the public Pixel ID in the browser

Only the numeric Pixel ID belongs in the browser. Apply the real marketing consent choice before dispatching. Do not use the snippet’s granted fixture consent as your application policy.

```ts
import { createBrowserSignals, createMetaPixelProvider } from '@techinject/browser';

const browser = createBrowserSignals({
  providers: [createMetaPixelProvider({ pixelId: '1234567890' })],
  consent: { analytics: false, marketing: false, observability: false },
});
// After your consent manager supplies the user's persisted permissions:
// browser.setConsent(currentPermissions);
// After your authorized host returns a verified purchase:
// await browser.track(verifiedPurchase);
```

## Keep CAPI credentials and matching data on the server

createMetaCapiProvider requires a token, a numeric Pixel ID, an explicit Graph API version and supported matching data. The adapter accepts SHA-256 hashed em, ph and external_id or validated fbp/fbc. Normalize matching values under the provider’s rules before hashing. Hashes still represent personal data and require an appropriate host consent and retention policy.

This configuration is illustrative: replace environment values with your server’s validated configuration. Avoid a long-lived userData callback tied to one customer on a shared server instance; create the provider for the correct order context. Never put the access token in a NEXT_PUBLIC variable.

```ts
import { createServerSignals, createMetaCapiProvider } from '@techinject/server';

// Call within the trusted order context, with host-validated configuration.
const server = createServerSignals({
  consent: orderConsent,
  providers: [
    createMetaCapiProvider({
      pixelId: hostConfig.pixelId,
      accessToken: hostConfig.accessToken,
      apiVersion: hostConfig.graphApiVersion,
      eventSourceUrl: 'https://your-shop.example/checkout',
      userData: () => ({ external_id: hashedCustomerId }),
    }),
  ],
});
await server.track(verifiedPurchase);
await server.flush();
server.dispose();
```

## Use the same input for both copies

The host returns the verified purchase input to the authorized storefront and keeps a durable copy for server retries. Both inputs share eventId and transaction_id. Refreshing a thank-you page must not create a new purchase event ID.

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

- Generate and persist the event ID before sending either copy.
- Retry failed server delivery with the persisted ID.
- Pass matching marketing consent for the actual order/customer.
- Do not assume a 2xx response proves matching or deduplication.

## How do you verify actual deduplication?

First check the local browser command eventID and CAPI event_id contain the same persisted value and both use Purchase. Then use your Meta account’s current test-event tooling to inspect acceptance and deduplication. Record the specific account and test conditions instead of making a blanket promise.

SignalKit validates transport acceptance using events_received and rejects provider error payloads. It cannot guarantee account configuration, matching quality, attribution or deduplication. The local fixture is useful evidence of formatting, not proof of a live result.

[Meta Pixel and server event deduplication documentation](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/)
