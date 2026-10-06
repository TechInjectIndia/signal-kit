export const integrationExamples = [
  {
    id: 'layout-example',
    title: 'Wire the Next.js root layout',
    language: 'tsx',
    label: 'app/layout.tsx',
    description:
      'Use the Providers client component shown above. Mount it once around the application; keep this root layout a server component.',
    code: `import type { ReactNode } from 'react';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}`,
  },
  {
    id: 'cart-example',
    title: 'Apply consent and track an add-to-cart event',
    language: 'tsx',
    label: 'app/cart-demo.tsx',
    description:
      'Synthetic interaction example: consent stays denied until the visitor clicks Allow. In production, replace the demo buttons with your consent manager and persist its choices. Call track after the host cart update succeeds. This uses the GA4 provider configured above; no server secret is needed.',
    code: `'use client';
import { useSignals } from '@techinject/nextjs';

export function CartDemo() {
  const signals = useSignals();
  return <>
    <button onClick={() => signals.setConsent({
      analytics: true, marketing: false, observability: false,
    })}>Allow analytics</button>
    <button onClick={() => signals.setConsent({
      analytics: false, marketing: false, observability: false,
    })}>Withdraw analytics</button>
    <button onClick={async () => {
      const outcomes = await signals.track({
        name: 'add_to_cart',
        properties: {
          currency: 'INR', value: 450,
          items: [{ item_id: 'notebook', price: 450, quantity: 1 }],
        },
      });
      console.log(outcomes); // Safe SDK outcomes; not proof of attribution.
    }}>Record demo add to cart</button>
  </>;
}`,
  },
  {
    id: 'next-api-example',
    title: 'Enable Next.js Node request telemetry',
    language: 'ts',
    label: 'instrumentation.ts (project root, or src/ when using src/app)',
    description:
      'Set SIGNALKIT_OTEL_ENABLED=true and OTEL_EXPORTER_OTLP_ENDPOINT in server-only host configuration to enable this. Use your own OTLP collector and its credentials. This global framework tracing is host-owned and independent of browser consent; retain an existing tracing setup instead of registering twice. Next Edge is unsupported.',
    code: `export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' &&
      process.env.SIGNALKIT_OTEL_ENABLED === 'true') {
    const { registerNextInstrumentation } = await import('@techinject/nextjs-server');
    registerNextInstrumentation({ serviceName: 'shop-nextjs' });
  }
}`,
  },
  {
    id: 'bun-local-example',
    title: 'Run Bun API tracking without a collector',
    language: 'ts',
    label: 'examples/bun/trace-demo.ts',
    description:
      'Save this file inside the built workspace and run pnpm --filter @signalkit/example-bun exec bun trace-demo.ts. Visit http://localhost:3300/orders/demo to see a local request record with /orders/:id. Observability is enabled for this synthetic fixture; production hosts supply their own policy. Wrap each routes-table handler too, because those bypass fallback fetch.',
    code: `import { createServerSignals } from '@techinject/server';
import { instrumentBunFetch } from '@techinject/bun';

const signals = createServerSignals({
  consent: { analytics: false, marketing: false, observability: true },
  observer: { record(record) { console.log(record); } },
  excludeUrls: ['/health'],
});
const server = Bun.serve({
  port: 3300,
  fetch: instrumentBunFetch(signals, (request) => {
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
  },
];
