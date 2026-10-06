export const sourceRef = '9f07183';
export const repository = 'https://github.com/TechInjectIndia/signal-kit';
export const faq = [
  [
    'What is SignalKit?',
    'SignalKit is an open-source, consent-aware ecommerce telemetry SDK. It gives Next.js and Bun projects shared typed events, page and request instrumentation, and adapters for analytics and observability providers.',
  ],
  [
    'Is SignalKit available on npm?',
    'Not yet. The local v1 implementation is unpublished. Clone the repository and build its workspace, or use locally packed packages. The @signalkit package names are provisional.',
  ],
  [
    'Which frameworks does SignalKit support?',
    'Next.js App Router on the Node runtime and Bun are the initial integrations. Next Edge is unsupported. SvelteKit, Hono, Astro, HTML/JavaScript, Django and Laravel adapters are future work, not verified integrations.',
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
import { SignalKitProvider, createGA4Provider } from '@signalkit/nextjs';

const config = {
  providers: [createGA4Provider({ measurementId: 'G-YOURID' })],
  consent: { analytics: false, marketing: false, observability: false },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return <SignalKitProvider config={config}>{children}</SignalKitProvider>;
}`;
export const bunExample = `import { createServerSignals, createOTLPObserver } from '@signalkit/server';
import { instrumentBunFetch } from '@signalkit/bun';

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
export const purchaseExample = `await signals.track({
  name: 'purchase',
  eventId: persistedOrder.eventId,
  properties: {
    transaction_id: persistedOrder.id,
    currency: 'INR',
    value: 450,
    items: [{ item_id: 'notebook', price: 450, quantity: 1 }],
  },
});`;
