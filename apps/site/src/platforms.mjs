import { nextExample, bunExample, purchaseExample } from './content.mjs';
import { integrationExamples } from './integration-examples.mjs';
export const platforms = [
  {
    name: 'Next.js',
    path: 'docs/nextjs/',
    logo: 'nextdotjs',
    description: 'App Router storefront, consent, ecommerce events and Node request telemetry.',
  },
  {
    name: 'Bun',
    path: 'docs/bun/',
    logo: 'bun',
    description: 'Incoming API handlers, safe routes, outbound fetch and OTLP export.',
  },
  ...[
    'SvelteKit',
    'Hono',
    'Astro',
    'Node.js',
    'HTML / JavaScript',
    'Django',
    'Laravel',
    'FastAPI',
    'Spring Boot',
    'Express',
    'Fastify',
    'NestJS',
    'CodeIgniter',
    'Vue',
    'Angular',
  ].map((name) => ({
    name,
    logo: {
      SvelteKit: 'svelte',
      Hono: 'hono',
      Astro: 'astro',
      'Node.js': 'nodedotjs',
      'HTML / JavaScript': 'javascript',
      Django: 'django',
      Laravel: 'laravel',
      FastAPI: 'fastapi',
      'Spring Boot': 'springboot',
      Express: 'express',
      Fastify: 'fastify',
      NestJS: 'nestjs',
      CodeIgniter: 'codeigniter',
      Vue: 'vuedotjs',
      Angular: 'angular',
    }[name],
    description: 'Dedicated integration and examples pending development.',
  })),
];
const setup = `git clone --branch main https://github.com/TechInjectIndia/signal-kit.git
cd signal-kit
pnpm install --frozen-lockfile
pnpm build`;
const snippet = (x) => ({
  title: x.title,
  paragraphs: [x.description],
  code: x.code,
  label: x.label,
});
export const platformPages = [
  {
    path: 'docs/nextjs/',
    label: 'Next.js integration',
    platform: true,
    title: 'SignalKit for Next.js — installation, consent and ecommerce tracking',
    description:
      'Set up SignalKit in Next.js App Router with a client provider, typed events, consent and separate Node instrumentation.',
    sections: [
      {
        title: 'Build and try the Next.js lab',
        paragraphs: [
          'Alpha packages are not published on npm yet. Start with Node 22 and pnpm 10.24.0. The lab uses synthetic data and local recorders. For a fresh external project, prepare the local alpha tarballs using pnpm release:prepare and follow the repository alpha install plan.',
        ],
        code: setup + '\npnpm --filter @signalkit/example-nextjs dev\n# Open http://localhost:3100',
        label: 'Terminal',
      },
      {
        title: 'Configure the client provider',
        paragraphs: [
          'Create app/providers.tsx. Replace the public GA4 measurement ID with your own. Consent starts denied. Keep all CAPI and collector credentials server-side. Provider structure is init-only; remount when providers or trace origins change.',
        ],
        code: nextExample,
        label: 'app/providers.tsx',
      },
      ...integrationExamples.slice(0, 3).map(snippet),
      {
        title: 'Track a verified purchase',
        paragraphs: [
          'Only emit after the host verifies paid state and persists an event ID. This server-only example uses persisted customer consent and a local marketing recorder. Replace it with your configured provider for live use; the host owns durable retries. Share the same event ID between authorized browser and server copies.',
        ],
        code: purchaseExample,
        label: 'Server-only verified order context',
      },
      {
        title: 'Check the integration',
        paragraphs: [
          'Grant analytics through your consent manager, navigate between pathname routes and record a demo cart event. Withdraw consent and confirm future analytics dispatch stops. Denied pages are dropped without replay. Disable GA4 Enhanced Measurement automatic history page changes when SignalKit sends pages. Browser fetch/XHR telemetry requires observability consent and a configured observer.',
          'Next global OpenTelemetry is separate from category consent and must follow the host policy. Edge is unsupported. Local dispatch and transport acceptance do not prove live provider delivery or attribution.',
        ],
        links: [
          [
            'https://github.com/TechInjectIndia/signal-kit/blob/main/packages/features/signals/INTEGRATION.md',
            'Full provider and lifecycle reference',
          ],
        ],
      },
    ],
  },
  {
    path: 'docs/bun/',
    label: 'Bun integration',
    platform: true,
    title: 'SignalKit for Bun — API instrumentation and OTLP integration',
    description:
      'Wrap Bun APIs, template safe routes, observe request outcomes and connect a compatible OTLP HTTP JSON collector.',
    sections: [
      {
        title: 'Build and try the Bun lab',
        paragraphs: [
          'Use Node 22, pnpm 10.24.0 and Bun 1.3.4 for the recorded setup. Alpha packages are available from source and local tarballs, not npm. The lab uses synthetic consent and local records.',
        ],
        code:
          setup +
          '\npnpm --filter @signalkit/example-bun dev\n# API fixture at http://localhost:3200',
        label: 'Terminal',
      },
      snippet(integrationExamples[3]),
      {
        title: 'Connect an OTLP collector',
        paragraphs: [
          'Replace the local observer with createOTLPObserver using your collector endpoint. This synthetic example enables observability; real hosts supply their own policy. Keep credentials server-only, exclude exporter paths and configure OTLP HTTP JSON on the collector.',
        ],
        code: bunExample,
        label: 'server.ts / OTLP observer',
      },
      {
        title: 'Instrument outbound requests',
        paragraphs: [
          'Global fetch is untouched. Use signals.fetch inside a wrapped request so incoming and outgoing records correlate. traceOrigins controls which destinations receive a generated traceparent; use explicit trusted origins. Replace the fixture URL with your host endpoint.',
        ],
        code: `// Add this to the createServerSignals configuration:
// traceOrigins: ['https://inventory.example'],

// Inside an instrumentBunFetch handler:
const result = await signals.fetch('https://inventory.example/stock');
return result;`,
        label: 'Inside your wrapped handler',
      },
      {
        title: 'Verify routes, errors and shutdown',
        paragraphs: [
          'Visit /orders/demo in the collector-free fixture: the record should use /orders/:id. /missing returns 404, while /health is excluded. Wrap every routes-table handler individually because route matches bypass fallback fetch. Do not attach raw bodies, arbitrary headers or customer identifiers.',
          'Flush within your host shutdown budget, then dispose. Delivery is best effort. Purchases need a separate correctly consented business-event instance, verified order state and a host-owned durable outbox.',
        ],
        links: [
          [
            'https://github.com/TechInjectIndia/signal-kit/blob/main/packages/features/signals/INTEGRATION.md',
            'Full provider and lifecycle reference',
          ],
        ],
      },
    ],
  },
];

export function platformCategories(name) {
  if (['Next.js', 'SvelteKit', 'Astro'].includes(name)) return ['frontend', 'backend'];
  if (['HTML / JavaScript', 'Vue', 'Angular'].includes(name)) return ['frontend'];
  return ['backend'];
}
