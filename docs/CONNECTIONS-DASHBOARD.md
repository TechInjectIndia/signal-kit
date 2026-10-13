# In-app connections health dashboard

Add `/connections` inside your authenticated app. This is local SDK status, not verified vendor account health. Packages are unpublished; use the workspace or local alpha packages and add `@techinject/browser` directly to the host dependencies.

## Next.js

Reuse the existing SignalKitProvider. Open your app origin plus `/connections` (the lab uses `http://localhost:3100/connections`).

```tsx
// app/connections/page.tsx — under your existing SignalKitProvider
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
}
```

## SvelteKit

The root layout provides `setContext('signals', client)` and owns the client lifecycle. The page below reuses it. Open your dev-server URL plus `/connections`. Mount only in the client lifecycle; see [Svelte lifecycle](https://svelte.dev/docs/svelte/lifecycle-hooks).

```svelte
<!-- src/routes/connections/+page.svelte -->
<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { createSvelteKitClient } from '@techinject/sveltekit';
  import { mountConnectionsDashboard } from '@techinject/browser/dashboard';

  // The root layout provides setContext('signals', client).
  const client = getContext<ReturnType<typeof createSvelteKitClient>>('signals');
  let container: HTMLDivElement;
  onMount(() => {
    // Idempotent; also handles the child mounting before its root layout.
    const signals = client.mount();
    return mountConnectionsDashboard(container, signals);
    // Root layout owns client.dispose(); this page only unmounts the view.
  });
</script>
<svelte:head>
  <title>Connections</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>
<h1>Connections</h1>
<div bind:this={container}></div>
```

## Bun / server

Bun has no browser page itself. Reuse the existing server instance and return safe snapshots from a host-authenticated endpoint to your frontend. There is no built-in endpoint or server collector; request-scoped counts reset per request.

```ts
// Read from your existing Bun/server instance, after relevant sends settle.
await signals.flush();
const connections = signals.getConnections();
// Return { connections } only from a host-authenticated diagnostics endpoint.
// No built-in endpoint, authentication or persistent server aggregation exists.
// Never return the signals object, provider config, tokens or event payloads.
```

## Portable HTML / JavaScript

Use your app bundler for bare package imports; this is not an unbundled standalone HTML install recipe. Your host router owns teardown.

```html
<!-- Inside your app's authenticated /connections page -->
<h1>Connections</h1>
<div id="connections"></div>
<script type="module">
  import { mountConnectionsDashboard } from '@techinject/browser/dashboard';
  import { signals } from './signals-client.js'; // your EXISTING client instance
  const cleanup = mountConnectionsDashboard(document.querySelector('#connections'), signals);
  // Your router/component must call cleanup() when the page unmounts.
</script>
```

## All platform availability

| Platform          | Dashboard integration                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Next.js           | Available in dashboard PR: full route above                                                                       |
| SvelteKit         | Available in dashboard PR: full route above                                                                       |
| Bun               | Available in dashboard PR: server snapshots, host frontend required                                               |
| Hono              | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| Astro             | Dedicated integration coming soon; portable browser rendering pattern above, native wiring unverified             |
| Node.js           | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| HTML / JavaScript | Dedicated integration coming soon; portable browser rendering pattern above, native wiring unverified             |
| Django            | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| Laravel           | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| FastAPI           | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| Spring Boot       | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| Express           | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| Fastify           | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| NestJS            | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| CodeIgniter       | Dedicated integration coming soon; host-authenticated snapshot/frontend pattern planned; native wiring unverified |
| Vue               | Dedicated integration coming soon; portable browser rendering pattern above, native wiring unverified             |
| Angular           | Dedicated integration coming soon; portable browser rendering pattern above, native wiring unverified             |

Coming-soon entries are pending development, with no committed release date or native installation recipe. Python, PHP and Java frameworks cannot import the TypeScript API as a native SDK.

## Appearance and verification

Style `.signalkit-connections` and its articles with host CSS; the Next lab provides a responsive example. Noindex is not authentication. Open the page signed in; check initial consent blocks, grant consent using your host controls and emit an allowed event, inspect its outcome, withdraw consent, then navigate away and back. Do not use fake purchases as probes.

The view shows current consent, configured provider names/categories, last outcome/time and aggregate completed, failed, denied, dropped and invalid counts. It stores no event IDs, payloads or raw errors. No network requests, cookies, storage, polling or test events are introduced. Rendering uses text nodes, including custom provider names.

Configuration does not verify connectivity. `sent` means the adapter's send returned successfully; browser scripts can merely enqueue work. Provider delivery, reporting, attribution and deduplication require independent checks. Consent denial takes precedence over a previous successful outcome. Counts reset when the SDK instance restarts and represent local outcomes, not unique delivered events. Technical `Observer` transports, global framework tracing, provider account health and cross-request/server aggregation are not included.

Core/server consumers can read `signals.getConnections()` and subscribe via `signals.subscribeConnections(listener)`, which returns an unsubscribe function. Snapshots are copied; listeners cannot disrupt dispatch. Request-scoped server instances have request-scoped counts. Any persistent aggregation or authenticated snapshot endpoint belongs to the host, and server credentials/provider objects must never cross into client code.
