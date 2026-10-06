export const sourceRef = 'main';
export const repository = 'https://github.com/TechInjectIndia/signal-kit';
export const faq = [
  [
    'What is SignalKit?',
    'SignalKit is an open-source, consent-aware ecommerce telemetry SDK. It gives Next.js and Bun projects shared typed events, page and request instrumentation, and adapters for analytics and observability providers.',
  ],
  [
    'Is SignalKit available on npm?',
    'Not yet. Alpha 0.1.0-alpha.1 is available from source and locally packed tarballs. Clone the repository and build its workspace, or use locally packed packages. The owner-selected @techinject scope is prepared for an alpha release; publication and npm ownership have not been verified.',
  ],
  [
    'Which frameworks does SignalKit support?',
    'Next.js App Router on the Node runtime and Bun are the initial integrations. Next Edge is unsupported. Coming soon: SvelteKit, Hono, Astro, standalone Node.js, HTML/vanilla JavaScript, Django and Laravel. Their dedicated integrations are pending development, with no committed release dates.',
  ],
  [
    'Does SignalKit automatically track every page and API?',
    'The browser tracks initial pages and pathname navigation, plus fetch and XMLHttpRequest status, duration and failures. Bun incoming requests require wrapped handlers; server outbound calls use signals.fetch. Next Node instrumentation uses host-owned OpenTelemetry. Query-only navigation and browser JavaScript errors are not automatically captured.',
  ],
  [
    'How does consent work?',
    'Browser consent starts denied. Events are dropped while their category is denied, without later replay. Your application supplies real persisted consent and updates analytics, marketing and observability permissions. Host-wide Next OpenTelemetry is configured separately.',
  ],
  [
    'Does SignalKit replace Sentry?',
    'No. SignalKit focuses on ecommerce events and request telemetry. It does not provide a hosted issue tracker, session replay product or automatic browser JavaScript error capture.',
  ],
  [
    'How should purchases be tracked?',
    'Track purchase only after your host verifies paid or captured order state. Persist a stable event ID with the order and use it for browser and server copies. Your host owns durable retries, idempotency, payment verification and customer consent.',
  ],
  [
    'Does Meta deduplication work automatically?',
    'SignalKit passes a stable event ID to Meta Pixel and CAPI so matching copies can be deduplicated by Meta. Actual provider matching, deduplication and attribution still need account-specific sandbox or live validation.',
  ],
  [
    'Do I need a SignalKit account or hosted collector?',
    'No SignalKit account or hosted collector is required. Configure your own provider accounts and, when using OTLP, your own compatible collector. SignalKit does not include an analytics dashboard.',
  ],
  [
    'What has been tested?',
    'The v1 build recorded 33 tests, local browser and Bun runtime checks, a Next production build and a local OpenTelemetry recorder. Provider scripts and payloads were checked with fixtures, not live attribution. The browser adapter bundle measured 10.6 kB gzip, excluding vendor scripts and React.',
  ],
  [
    'Is SignalKit free to use?',
    'The source code is MIT licensed. Provider accounts, infrastructure and third-party services have their own pricing and terms. No production reliability guarantee is offered.',
  ],
];
export const pages = [
  {
    path: '',
    title: 'SignalKit — consent-aware ecommerce analytics for Next.js & Bun',
    description:
      'An open-source ecommerce telemetry SDK with typed events, automatic pages and request tracking, consent controls, and GA4, Meta and OTLP integrations.',
    label: 'Overview',
  },
  {
    path: 'docs/',
    title: 'SignalKit quickstart — Next.js and Bun integration guide',
    description:
      'Build SignalKit locally, connect a Next.js root provider or Bun request wrapper, and understand consent, verified purchases and server-only credentials.',
    label: 'Quickstart',
  },
  {
    path: 'integrations/',
    title: 'SignalKit integrations — GA4, Meta, Clarity and OpenTelemetry',
    description:
      'Explore SignalKit analytics and observability adapters, supported Next.js and Bun runtimes, setup requirements, and current verification limits.',
    label: 'Integrations',
  },
  {
    path: 'faq/',
    title: 'SignalKit FAQ — consent, automatic tracking and open-source status',
    description:
      'Clear answers about SignalKit framework support, consent defaults, purchase tracking, Meta event IDs, npm availability and compatibility evidence.',
    label: 'FAQ',
  },
];
export const nextExample = `'use client';
import { SignalKitProvider, createGA4Provider } from '@techinject/nextjs';

const config = {
  providers: [createGA4Provider({ measurementId: 'G-YOURID' })],
  consent: { analytics: false, marketing: false, observability: false },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return <SignalKitProvider config={config}>{children}</SignalKitProvider>;
}`;
export const bunExample = `import { createServerSignals, createOTLPObserver } from '@techinject/server';
import { instrumentBunFetch } from '@techinject/bun';

const signals = createServerSignals({
  consent: { analytics: false, marketing: false, observability: true },
  observer: createOTLPObserver({
    endpoint: 'http://localhost:4318/v1/traces',
    serviceName: 'shop-api',
  }),
});

Bun.serve({
  fetch: instrumentBunFetch(signals, async () => Response.json({ ok: true })),
});`;
export const purchaseExample = `import { createServerSignals } from '@techinject/server';

// Independent business-event instance; local recorder for this example.
// In production, inject your configured marketing provider and persisted consent.
const purchases = createServerSignals({
  consent: persistedOrder.consent,
  providers: [{
    name: 'local-purchase-recorder', category: 'marketing',
    send(event) { console.log({ name: event.name, eventId: event.eventId }); },
  }],
});

await purchases.track({
  name: 'purchase',
  eventId: persistedOrder.eventId,
  properties: {
    transaction_id: persistedOrder.id,
    currency: 'INR',
    value: 450,
    items: [{ item_id: 'notebook', price: 450, quantity: 1 }],
  },
});`;

export const guideDate = '2026-10-06';
export const guides = [
  {
    path: 'guides/nextjs-purchase-tracking/',
    title: 'Verified purchase tracking in Next.js — SignalKit guide',
    label: 'Verified purchases in Next.js',
    description:
      'Track purchases from verified order state in Next.js, preserve event IDs across browser and server copies, and test consent and durable retries locally.',
    sections: [
      {
        title: 'Why a checkout success page is insufficient',
        paragraphs: [
          'A redirect can be replayed, interrupted or visited without a captured payment. Treat it as presentation, not an authoritative purchase trigger. A trusted server must verify the payment notification, match the order amount and currency, and persist paid state before creating a purchase event.',
          'SignalKit accepts typed telemetry; it does not verify your payment or persist your orders. The included Bun lab demonstrates a signed Razorpay webhook and SQLite outbox using synthetic orders. It is a reference for the trust boundary, not a production payment service.',
        ],
      },
      {
        title: 'Run the existing complete example',
        paragraphs: [
          'Use Node 22, pnpm 10.24.0 and Bun 1.3.4. Start both hosts in separate terminals. The Next lab and Bun fixture let you inspect denied consent, permitted events and verified synthetic payment replay without real provider credentials.',
        ],
        setup: true,
      },
      {
        title: 'Send a trusted event after order verification',
        paragraphs: [
          'Use this event shape in the verified-payment branch of your server handler. The values below illustrate a trusted persisted order. Generate eventId once when the host creates its durable delivery record, then reuse it on every attempt. Persist transaction_id, currency, value and line items from the trusted order, rather than taking them from the browser.',
        ],
        code: purchaseExample,
        label: 'Trusted host purchase event',
      },
      {
        title: 'Connect the Next.js browser provider',
        paragraphs: [
          'Place a client provider around your root layout children. Start with denied permissions, then apply the user’s real persisted choice through useSignals().setConsent. Events dropped before consent are not replayed. Parent configuration must remain consistent with the current consent state.',
        ],
        code: nextExample,
        label: 'app/providers.tsx',
        bullets: [
          'Send a browser purchase copy only after your server returns the verified order state and persisted event ID to an authorized customer.',
          'Avoid adding email, address or other customer identifiers to commerce fields.',
          'Disable GA4 Enhanced Measurement automatic history page changes when SignalKit sends explicit pages.',
          'Do not silently set all consent categories to true to make the demo produce events.',
        ],
      },
      {
        title: 'Make retries a host responsibility',
        paragraphs: [
          'Write a delivery record transactionally with your order transition. A host worker can retry transient provider errors using the same event ID. Decide which diagnostic outcomes allow the outbox to mark a provider copy complete; a timed-out transport is not proof that the destination received nothing.',
          'An in-memory telemetry call is best effort. SignalKit’s pending limits and timeouts protect host responses, but they are not a durable queue. Your host supplies crash recovery, replay protection, per-customer consent and a retention policy.',
        ],
      },
      {
        title: 'What should you test before production?',
        paragraphs: [
          'Replay a signed captured-payment fixture twice and verify the same persisted purchase ID. Reject altered signatures, mismatched amount/currency and unpaid state. Simulate a timeout between provider acceptance and acknowledgement. Confirm denied consent does not dispatch, and inspect accepted events in your own provider account before claiming live attribution.',
          'The repository’s local tests establish fixture behavior. They do not establish that GA4 or Meta attributed a real customer purchase. No npm install command is offered while packages remain unpublished.',
        ],
        links: [
          [
            'https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation',
            'Next.js instrumentation reference',
          ],
          ['https://razorpay.com/docs/webhooks/validate-test/', 'Razorpay webhook validation'],
        ],
      },
    ],
  },
  {
    path: 'guides/meta-pixel-capi-event-ids/',
    title: 'Share Meta Pixel and CAPI event IDs — SignalKit guide',
    label: 'Meta Pixel and CAPI event IDs',
    description:
      'Use a persisted purchase event ID for Meta Pixel and CAPI copies, keep access tokens server-only, and distinguish payload checks from live deduplication.',
    sections: [
      {
        title: 'Give one purchase one stable event ID',
        paragraphs: [
          'A browser Pixel copy and server Conversions API copy describe the same purchase. SignalKit maps purchase to Meta Purchase in both adapters and places your eventId into the corresponding provider field. The host must supply the same value in both copies.',
          'Keep four identities separate: transaction_id identifies the trusted order, eventId identifies this purchase occurrence, a trace ID describes a request chain, and an optional session identifier describes a visit. A retried payment webhook may create a new trace, but its purchase event ID must remain stable.',
        ],
      },
      {
        title: 'Inspect the runnable fixture first',
        paragraphs: [
          'Clone and build the workspace, then run its Next.js and Bun labs. The local inspector shows dispatched event names and IDs; fixtures exercise provider command and payload shapes without live attribution claims.',
        ],
        setup: true,
      },
      {
        title: 'Configure the public Pixel ID in the browser',
        paragraphs: [
          'Only the numeric Pixel ID belongs in the browser. Apply the real marketing consent choice before dispatching. Do not use the snippet’s granted fixture consent as your application policy.',
        ],
        code: `import { createBrowserSignals, createMetaPixelProvider } from '@techinject/browser';

const browser = createBrowserSignals({
  providers: [createMetaPixelProvider({ pixelId: '1234567890' })],
  consent: { analytics: false, marketing: false, observability: false },
});
// After your consent manager supplies the user's persisted permissions:
// browser.setConsent(currentPermissions);
// After your authorized host returns a verified purchase:
// await browser.track(verifiedPurchase);`,
        label: 'Browser integration shape',
      },
      {
        title: 'Keep CAPI credentials and matching data on the server',
        paragraphs: [
          'createMetaCapiProvider requires a token, a numeric Pixel ID, an explicit Graph API version and supported matching data. The adapter accepts SHA-256 hashed em, ph and external_id or validated fbp/fbc. Normalize matching values under the provider’s rules before hashing. Hashes still represent personal data and require an appropriate host consent and retention policy.',
          'This configuration is illustrative: replace environment values with your server’s validated configuration. Avoid a long-lived userData callback tied to one customer on a shared server instance; create the provider for the correct order context. Never put the access token in a NEXT_PUBLIC variable.',
        ],
        code: `import { createServerSignals, createMetaCapiProvider } from '@techinject/server';

// Call within the trusted order context, with host-validated configuration.
const server = createServerSignals({
  consent: orderConsent,
  providers: [createMetaCapiProvider({
    pixelId: hostConfig.pixelId,
    accessToken: hostConfig.accessToken,
    apiVersion: hostConfig.graphApiVersion,
    eventSourceUrl: 'https://your-shop.example/checkout',
    userData: () => ({ external_id: hashedCustomerId }),
  })],
});
await server.track(verifiedPurchase);
await server.flush();
server.dispose();`,
        label: 'Server-only order context',
      },
      {
        title: 'Use the same input for both copies',
        paragraphs: [
          'The host returns the verified purchase input to the authorized storefront and keeps a durable copy for server retries. Both inputs share eventId and transaction_id. Refreshing a thank-you page must not create a new purchase event ID.',
        ],
        code: purchaseExample,
        label: 'Shared verified purchase shape',
        bullets: [
          'Generate and persist the event ID before sending either copy.',
          'Retry failed server delivery with the persisted ID.',
          'Pass matching marketing consent for the actual order/customer.',
          'Do not assume a 2xx response proves matching or deduplication.',
        ],
      },
      {
        title: 'How do you verify actual deduplication?',
        paragraphs: [
          'First check the local browser command eventID and CAPI event_id contain the same persisted value and both use Purchase. Then use your Meta account’s current test-event tooling to inspect acceptance and deduplication. Record the specific account and test conditions instead of making a blanket promise.',
          'SignalKit validates transport acceptance using events_received and rejects provider error payloads. It cannot guarantee account configuration, matching quality, attribution or deduplication. The local fixture is useful evidence of formatting, not proof of a live result.',
        ],
        links: [
          [
            'https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/',
            'Meta Pixel and server event deduplication documentation',
          ],
        ],
      },
    ],
  },
  {
    path: 'guides/bun-api-tracing/',
    title: 'Trace Bun APIs without raw request payloads — SignalKit guide',
    label: 'Bun API tracing',
    description:
      'Wrap Bun request handlers, capture status and duration, correlate outbound fetches, and keep sensitive paths and raw bodies out of technical telemetry.',
    sections: [
      {
        title: 'Start with request metadata',
        paragraphs: [
          'You often need to know which endpoint failed and how long it took before you need its raw request body. SignalKit’s Bun adapter captures method, safe route, status, duration and trace context. It does not attach request bodies or arbitrary headers to those request records.',
          'Route names still deserve attention. Safe-route heuristics replace numeric IDs, UUIDs, long segments and email-like segments, but cannot recognize every sensitive slug. Supply route templates and exclusions based on your actual API. Do not include secrets in URL path names.',
        ],
      },
      {
        title: 'Run the local server fixture',
        paragraphs: [
          'The workspace contains an actual Bun HTTP example. Start the server fixture below, inspect local records, and use the synthetic signed-payment tests to check request outcomes without external credentials.',
        ],
        setup: true,
      },
      {
        title: 'Wrap incoming requests explicitly',
        paragraphs: [
          'This code is a complete local server that prints safe records through an injected observer. Save it as examples/bun/trace-demo.ts inside the built workspace, then run pnpm --filter @signalkit/example-bun exec bun trace-demo.ts. Technical consent here is for the synthetic fixture; your real host supplies its own policy.',
        ],
        code: `import { createServerSignals } from '@techinject/server';
import { instrumentBunFetch } from '@techinject/bun';

const signals = createServerSignals({
  consent: { analytics: false, marketing: false, observability: true },
  observer: { record: (record) => { console.log(record); } },
  traceOrigins: ['http://localhost:3300'],
  excludeUrls: ['/health'],
});
const server = Bun.serve({
  port: Number(Bun.env.PORT ?? '3300'),
  fetch: instrumentBunFetch(signals, async (request) => {
    const path = new URL(request.url).pathname;
    if (path === '/health') return Response.json({ ok: true });
    if (path.startsWith('/orders/')) return Response.json({ ok: true });
    return new Response('Not found', { status: 404 });
  }, (request) => new URL(request.url).pathname.startsWith('/orders/')
    ? '/orders/:id' : undefined),
});
process.on('SIGINT', async () => {
  server.stop();
  await signals.flush();
  signals.dispose();
  process.exit(0);
});`,
        label: 'examples/bun/trace-demo.ts',
      },
      {
        title: 'Check safe routes and failures',
        paragraphs: [
          'Request http://localhost:3300/orders/customer-secret and confirm the observer records /orders/:id. Request /missing and check status 404 with error true. Request /health and confirm the explicit exclusion suppresses telemetry. The example returns response bodies unchanged.',
          'If you use Bun’s routes table, wrap each route handler: a routes-table match bypasses the fallback fetch handler. Global fetch is untouched. Use signals.fetch inside a wrapped request to create outbound request telemetry and preserve the incoming trace context.',
        ],
      },
      {
        title: 'Connect your own OTLP collector',
        paragraphs: [
          'Replace the console observer with createOTLPObserver. The endpoint must accept OTLP HTTP JSON. Configure credentials server-side if your collector requires them, and exclude telemetry transport paths to avoid tracing export recursively.',
        ],
        code: bunExample,
        label: 'OTLP HTTP JSON observer',
        bullets: [
          'Allowlist traceOrigins for destinations that should receive traceparent; cross-origin browser requests also need compatible CORS configuration.',
          'Use signals.fetch for outbound calls rather than expecting global fetch patches.',
          'Observe bounded capacity, timeout and transport errors through the observer’s onError callback.',
          'Flush within your host’s shutdown budget; telemetry remains best effort.',
        ],
      },
      {
        title: 'What does the local check establish?',
        paragraphs: [
          'The repository exercises an actual Bun server and a local OTLP recorder. That checks request instrumentation and JSON transport shapes. It does not prove a deployed SigNoz collector, production durability or complete distributed-trace visibility.',
          'Request telemetry belongs in observability, not as one GA4 or Meta marketing event for every API call. Next.js uses a separate host-owned OpenTelemetry integration; its global policy is independent of SignalKit’s consent categories.',
        ],
        links: [
          ['https://bun.sh/docs/runtime/http/server', 'Bun HTTP server reference'],
          ['https://opentelemetry.io/docs/specs/otlp/', 'OTLP specification'],
        ],
      },
    ],
  },
];
pages.push(
  {
    path: 'guides/',
    title: 'SignalKit guides — ecommerce tracking and Bun API tracing',
    description:
      'Practical guides to verified Next.js purchases, coordinated Meta Pixel and CAPI IDs, and Bun API tracing with runnable local examples.',
    label: 'Guides',
  },
  ...guides,
);
