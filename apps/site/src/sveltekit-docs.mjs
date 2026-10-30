export const sveltekitClientExample = `<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { createSvelteKitClient, createGA4Provider } from '@techinject/sveltekit';
  let { children } = $props();
  const client = createSvelteKitClient({
    providers: [createGA4Provider({ measurementId: 'G-YOURID' })],
    consent: { analytics: false, marketing: false, observability: false },
  });
  setContext('signals', client);
  onMount(() => { client.mount(); return () => client.dispose(); });
</script>
{@render children()}`;
export const sveltekitServerExample = `// src/hooks.server.ts — Node runtime only
import { createSvelteKitHooks, createOTLPObserver } from '@techinject/sveltekit-server';
const hooks = createSvelteKitHooks((event) => ({
  // Replace with the host's real, request-specific policy after authentication.
  consent: { analytics: false, marketing: false, observability: false },
  observer: createOTLPObserver({
    endpoint: 'http://localhost:4318/v1/traces', serviceName: 'shop-sveltekit',
  }),
  traceOrigins: ['https://inventory.example'],
  excludeUrls: ['/v1/traces'],
  timeoutMs: 2000,
}));
export const handle = hooks.handle;
export const handleFetch = hooks.handleFetch;`;
export const sveltekitPage = {
  datePublished: '2026-10-12',
  path: 'docs/sveltekit/',
  platform: true,
  label: 'SvelteKit integration',
  title: 'SignalKit for SvelteKit — client lifecycle and Node request hooks',
  description:
    'Integrate SignalKit with SvelteKit 3 and Svelte 5: SSR-safe browser lifecycle, consent-aware commerce events and isolated Node request tracing.',
  sections: [
    {
      title: 'Build and try the local lab',
      paragraphs: [
        'Alpha 0.1.0-alpha.2 is published on npm. Pin @techinject/sveltekit, @techinject/browser and any server adapter to this version, or use the source lab with Bun 1.4.4 or newer. The fixture uses SvelteKit 3.0.1, Svelte 5.57.2 and adapter-node 6.0.0. Kit 2 and Edge are not certified by this build.',
      ],
      code: `git clone --branch main https://github.com/TechInjectIndia/signal-kit.git
cd signal-kit
bun install --frozen-lockfile
bun run build
bun run --filter @signalkit/example-sveltekit dev
# http://127.0.0.1:3400`,
      label: 'Terminal',
    },
    {
      title: 'Mount once in the root layout',
      paragraphs: [
        'Create the client per layout, keep browser setup inside onMount, and return dispose for cleanup. Constructor execution during SSR is safe; mount is browser-only. Replace the public GA4 ID. The browser entry contains no Node/server code or credentials.',
      ],
      code: sveltekitClientExample,
      label: 'src/routes/+layout.svelte',
    },
    {
      title: 'Connect consent and business events',
      paragraphs: [
        'A child component can read the layout context and obtain the mounted browser API. Apply your actual persisted consent via setConsent. Pages denied before that decision are dropped without replay; page() can explicitly record the current page after consent.',
        'Initial and pathname pages are automatic; do not add an afterNavigate page call for every route. Query-only changes are not new pages. Disable GA4 Enhanced Measurement history tracking to prevent duplicate vendor pages. Technical browser fetch/XHR needs an observer and observability consent.',
      ],
      code: `<script lang="ts">
  import { getContext } from 'svelte';
  import type { createSvelteKitClient } from '@techinject/sveltekit';
  const client = getContext<ReturnType<typeof createSvelteKitClient>>('signals');
  async function recordCart() {
    // Call only after the host cart operation succeeds.
    await client.getSignals().track({
      name: 'add_to_cart',
      properties: { currency: 'INR', value: 450,
        items: [{ item_id: 'notebook', price: 450, quantity: 1 }] },
    });
  }
</script>
<button onclick={recordCart}>Record cart event</button>`,
      label: 'Mounted child component',
    },
    {
      title: 'Instrument Node server requests',
      paragraphs: [
        'Export both hooks. The config factory must use this request’s authorized policy and return fresh observer/provider instances; the adapter disposes them at request completion. The snippet keeps observability denied until you supply that policy. Compose authentication before handle with SvelteKit sequence.',
        'Incoming records use route.id templates. handleFetch instruments SvelteKit’s own fetch, preserving cookies and internal routing; no global server fetch patch is installed. Collector tokens stay server-only.',
      ],
      code: sveltekitServerExample,
      label: 'src/hooks.server.ts',
    },
    {
      title: 'Verify behavior and boundaries',
      paragraphs: [
        'Run bun run test:sveltekit after building. The real Node production app checks SSR/hydration, navigation page counts, consent withdrawal, commerce/request records and internal-fetch trace correlation.',
        'Prerender can invoke handle; use denied policy during builds when appropriate. Static assets and platform requests outside the hook pipeline are not included. Streaming/background work after resolve is outside the request lifecycle. Flush is bounded and best effort; the host owns durable purchases and retries. Live provider matching, attribution and delivery remain unverified.',
      ],
      links: [
        [
          'https://github.com/TechInjectIndia/signal-kit/blob/main/packages/features/signals/INTEGRATION.md',
          'Full integration reference',
        ],
        ['https://svelte.dev/docs/kit/hooks', 'SvelteKit hook reference'],
      ],
    },
  ],
};
