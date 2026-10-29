export const nextConnectionsExample = `// app/connections/page.tsx — under your existing SignalKitProvider
'use client';
import { useEffect, useRef } from 'react';
import { useSignals } from '@techinject/nextjs';
import { mountConnectionsDashboard } from '@techinject/browser/dashboard';
export default function Connections() {
  const signals = useSignals();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (element.current) return mountConnectionsDashboard(element.current, signals);
  }, [signals]);
  return <div ref={element} />;
}`;

export const svelteConnectionsExample =
  "<!-- src/routes/connections/+page.svelte -->\n<script lang=\"ts\">\n  import { getContext, onMount } from 'svelte';\n  import type { createSvelteKitClient } from '@techinject/sveltekit';\n  import { mountConnectionsDashboard } from '@techinject/browser/dashboard';\n\n  // The root layout provides setContext('signals', client).\n  const client = getContext<ReturnType<typeof createSvelteKitClient>>('signals');\n  let container: HTMLDivElement;\n  onMount(() => {\n    // Idempotent; also handles the child mounting before its root layout.\n    const signals = client.mount();\n    return mountConnectionsDashboard(container, signals);\n    // Root layout owns client.dispose(); this page only unmounts the view.\n  });\n</script>\n<svelte:head>\n  <title>Connections</title>\n  <meta name=\"robots\" content=\"noindex, nofollow\" />\n</svelte:head>\n<h1>Connections</h1>\n<div bind:this={container}></div>";
export const serverConnectionsExample =
  '// Read from your existing Bun/server instance, after relevant sends settle.\nawait signals.flush();\nconst connections = signals.getConnections();\n// Return { connections } only from a host-authenticated diagnostics endpoint.\n// No built-in endpoint, authentication or persistent server aggregation exists.\n// Never return the signals object, provider config, tokens or event payloads.';
export const htmlConnectionsExample =
  "<!-- Inside your app's authenticated /connections page -->\n<h1>Connections</h1>\n<div id=\"connections\"></div>\n<script type=\"module\">\n  import { mountConnectionsDashboard } from '@techinject/browser/dashboard';\n  import { signals } from './signals-client.js'; // your EXISTING client instance\n  const cleanup = mountConnectionsDashboard(document.querySelector('#connections'), signals);\n  // Your router/component must call cleanup() when the page unmounts.\n</script>";

export function createConnectionsPage(platforms) {
  return {
    path: 'docs/connections/',
    platform: true,
    datePublished: '2026-10-13',
    label: 'Connections health dashboard',
    title: 'SignalKit connections health dashboard — setup for every platform',
    description:
      'Open an in-app connections dashboard with Next.js or SvelteKit, read Bun server snapshots, and see the planned dashboard integration for every coming-soon platform.',
    sections: [
      {
        title: 'What connection health means here',
        paragraphs: [
          'The dashboard shows configured event providers, current consent, last SDK outcome/time and per-instance counters. It makes no provider probes and retains no payloads, event IDs, raw errors or credentials. Technical observers, provider account health, delivery, attribution and persistent server history are not included.',
          'Add @techinject/browser directly to the host dependencies for the optional dashboard subpath. Packages are published as 0.1.0-alpha.2; pin this exact version or use the workspace. Style .signalkit-connections with host CSS. Protect the route with host authentication; noindex is not access control.',
          'Blocked by consent means the current category is denied. Configured means no outcome has completed yet. SDK send completed means the adapter returned, possibly after queueing work. Failed, dropped/interrupted and invalid describe local dispatch outcomes. Counts reset with the SDK instance.',
        ],
      },
      {
        title: 'Next.js — add /connections',
        paragraphs: [
          'Place this page under your existing SignalKitProvider. Open http://localhost:3100/connections in the lab, or your own app origin plus /connections.',
        ],
        label: 'app/connections/page.tsx',
        code: nextConnectionsExample,
      },
      {
        title: 'SvelteKit — add /connections',
        paragraphs: [
          'Your root layout must create the client, provide the signals context with setContext, mount it in onMount and own disposal. This page reuses that context and unmounts only the dashboard. Open your dev server URL plus /connections (the SignalKit fixture uses port 3400).',
        ],
        label: 'src/routes/connections/+page.svelte',
        code: svelteConnectionsExample,
        links: [
          ['../sveltekit/', 'Root layout setup'],
          ['https://svelte.dev/docs/svelte/lifecycle-hooks', 'Svelte client lifecycle reference'],
        ],
      },
      {
        title: 'Bun — server connection snapshots',
        paragraphs: [
          'Bun has no browser page by itself. Use the existing server SDK instance and a host-authenticated diagnostics endpoint to feed your frontend. This is a wiring pattern, not a built-in endpoint. Request-scoped instances have request-scoped counts; the host owns any longer-lived aggregation. A browser SDK instance cannot read server status automatically.',
        ],
        label: 'Server snapshot',
        code: serverConnectionsExample,
      },
      {
        title: 'Portable HTML / JavaScript rendering',
        paragraphs: [
          'Use this renderer in any host browser page after your existing client is initialized. Resolve package imports with your app bundler; these bare package imports will not run as an unbundled HTML file without module resolution. This portable renderer does not certify a native adapter for a coming-soon framework.',
        ],
        label: 'Host browser page (bundled)',
        code: htmlConnectionsExample,
      },
      ...platforms
        .filter((platform) => !platform.path)
        .map((platform) => ({
          title: platform.name + ' — coming soon',
          paragraphs: [
            'Dedicated integration pending development. No verified native dashboard route or framework adapter is available yet; no release date is committed.',
            ['Vue', 'Angular', 'Astro', 'HTML / JavaScript'].includes(platform.name)
              ? 'Planned wiring: mount the portable browser renderer against the existing consent-aware client, then unsubscribe on route/component teardown. Use the portable pattern above only where the existing browser SDK is already wired; framework-specific setup remains unverified.'
              : 'Planned wiring: expose safe server connection snapshots through host authentication and render them in an existing frontend. No native API, credentials bridge or persistent collector is provided. Python, PHP and Java SDKs cannot use the TypeScript server API as a native integration.',
          ],
        })),
      {
        title: 'Verify the page',
        paragraphs: [
          'Open /connections after signing in. Check configured provider names with consent denied; grant consent through your real app controls and emit an allowed event. Look for its local outcome and timestamp, then withdraw consent and confirm Blocked by consent. Navigate away and back to check teardown. Never send fake purchases as connection tests. Validate provider delivery independently in the provider account.',
        ],
      },
    ],
  };
}
