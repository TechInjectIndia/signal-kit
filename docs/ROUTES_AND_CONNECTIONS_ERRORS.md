# Routing & Connections: Bug, Error, and Integration Guide

This document catalogs all confirmed bugs, framework edge cases, import traps, and architectural limitations regarding **routing**, **navigation**, and **importing connections** when using SignalKit or integrating it into an external website.

---

## Table of Contents

- [1. Routing & Navigation Bugs](#1-routing--navigation-bugs)
  - [1.1 In-Page Hash Anchors Trigger Duplicate `page_view` Events](#11-in-page-hash-anchors-trigger-duplicate-page_view-events)
  - [1.2 Query Parameter Stripping & SPA Sub-Route Data Loss](#12-query-parameter-stripping--spa-sub-route-data-loss)
  - [1.3 Ad Attribution (UTM, `gclid`, `fbclid`) Stripped in Core Event Routes](#13-ad-attribution-utm-gclid-fbclid-stripped-in-core-event-routes)
  - [1.4 SvelteKit 2 `event.route` Null Pointer Vulnerability](#14-sveltekit-2-eventroute-null-pointer-vulnerability)
  - [1.5 Bun Declarative Route Table Telemetry Bypass](#15-bun-declarative-route-table-telemetry-bypass)
  - [1.6 Server-Side `fetch` Crashes on Relative URLs](#16-server-side-fetch-crashes-on-relative-urls)
  - [1.7 Route Groups `/(group)` Leaked into Server Route IDs](#17-route-groups-group-leaked-into-server-route-ids)
- [2. Importing Connections Errors & Traps](#2-importing-connections-errors--traps)
  - [2.1 Subpath Export Missing in Framework Wrappers](#21-subpath-export-missing-in-framework-wrappers)
  - [2.2 Strict Package Manager Transitive Dependency Failure](#22-strict-package-manager-transitive-dependency-failure)
  - [2.3 SSR / Server Component Crash (`document is not defined`)](#23-ssr--server-component-crash-document-is-not-defined)
  - [2.4 Per-Instance In-Memory Counters](#24-per-instance-in-memory-counters)
  - [2.5 \"SDK Send Completed\" Does NOT Prove Live Upstream Vendor Delivery](#25-sdk-send-completed-does-not-prove-live-upstream-vendor-delivery)
  - [2.6 Server vs. Client Boundary Bundle Crash](#26-server-vs-client-boundary-bundle-crash)
- [3. Safe Implementation Patterns for External Websites](#3-safe-implementation-patterns-for-external-websites)
  - [3.1 Next.js 15+ Safe Connections Dashboard Route](#31-nextjs-15-safe-connections-dashboard-route)
  - [3.2 SvelteKit Safe Connections Dashboard Route](#32-sveltekit-safe-connections-dashboard-route)
  - [3.3 Safe Server SvelteKit Hook Route Guard](#33-safe-server-sveltekit-hook-route-guard)

---

## 1. Routing & Navigation Bugs

### 1.1 In-Page Hash Anchors Trigger Duplicate `page_view` Events

- **Source:** `packages/features/signals/browser/src/index.ts`
- **Status:** Resolved. The browser SDK listens to `hashchange` only when `trackHash: true` is configured. Only `#/` and `#!/` hashes are treated as routes; ordinary anchors are ignored. Automatic page views deduplicate on the resolved route path before sanitizing the event payload.
- **Verification:** The browser test covers `#reviews` and hash-route transitions with and without `trackHash`.

---

### 1.2 Query Parameter Stripping & SPA Sub-Route Data Loss

- **Source:** `packages/features/signals/core/src/index.ts` (`safeRoute`)
- **Mechanism:**
  SignalKit enforces privacy by routing paths through `safeRoute()`:
  ```ts
  const path = new URL(cleaned || '/', 'http://signalkit.invalid').pathname;
  ```
  Accessing `pathname` automatically truncates and discards all URL query parameters (`search`).
- **Error Manifestation:**
  Applications utilizing query-based routing (e.g., `/products?category=shoes`, `/checkout?step=payment`, `/search?q=tshirt`, `/dashboard?tab=overview`) have all query strings eliminated.
- **Consequence:** All sub-page navigation is recorded identically as `/products`, `/checkout`, `/search`, or `/dashboard`. SPA state transitions that rely on query strings cannot be distinguished in analytics.

---

### 1.3 Ad Attribution (UTM, `gclid`, `fbclid`) Stripped in Core Event Routes

- **Source:** `packages/features/signals/browser/src/index.ts`
- **Mechanism:**
  The default browser `page()` tracking call dispatches:
  ```ts
  return core.track({
    name: 'page_view',
    properties: {
      page_path: safeRoute(routePath ?? '/'),
    },
  });
  ```
- **Error Manifestation:**
  While the GA4 provider includes a whitelist for `page_location` (`safePageLocation`), the primary event payload (`properties.page_path`) emitted by the SDK is scrubbed by `safeRoute`.
- **Consequence:** Any custom analytics observers, backend webhooks, or OpenTelemetry (OTLP) collectors will only receive `page_path: '/'`. Campaign source tracking (`utm_source`, `utm_medium`, `utm_campaign`), Google Ads click IDs (`gclid`), and Meta click IDs (`fbclid`) are completely absent from the structured event properties.

---

### 1.4 SvelteKit 2 `event.route` Null Pointer Vulnerability

- **Source:** `packages/features/signals/sveltekit-server/src/index.ts`
- **Mechanism:**
  The server hook handler delegates route identification with:
  ```ts
  signals.handle(event.request, () => resolve(event), {
    route: event.route.id ?? undefined,
  });
  ```
- **Error Manifestation:**
  In SvelteKit 2, `event.route` can evaluate to `null` or `undefined` (especially in standalone server endpoints, fallback handlers, or prerender passes).
- **Consequence:** Accessing `event.route.id` throws an uncaught `TypeError: Cannot read properties of undefined (reading 'id')` or `TypeError: Cannot read properties of null (reading 'id')`, causing server requests to crash.
- **Fix:** Must use optional chaining: `event.route?.id ?? undefined`.

---

### 1.5 Bun Declarative Route Table Telemetry Bypass

- **Source:** `packages/features/signals/bun/src/index.ts`
- **Mechanism:**
  In Bun 1.2+, `Bun.serve` supports a declarative routes dictionary:
  ```ts
  Bun.serve({
    routes: {
      '/api/checkout': () => new Response('ok'),
    },
    fetch(req) { ... }
  });
  ```
  `instrumentBunFetch` only wraps the fallback `fetch` property.
- **Error Manifestation:**
  Incoming HTTP requests that match an entry in the declarative `routes` table execute directly in Bun's C++ HTTP layer and never hit the fallback `fetch` wrapper.
- **Consequence:** Telemetry, trace parent headers, and observation spans are completely bypassed for all routes defined in the declarative route table.

---

### 1.6 Server-Side `fetch` Crashes on Relative URLs

- **Source:** `packages/features/signals/server/src/index.ts`
- **Mechanism:**
  In Node.js runtimes, calling internal fetches with relative paths (e.g. `signals.fetch('/api/cart')` or `fetch('/api/orders')`) triggers:
  ```ts
  const request = new Request(input, init);
  ```
- **Error Manifestation:**
  Unlike browser runtimes, Node.js does not have a global window origin. `new Request('/api/cart')` throws:
  `TypeError: Failed to parse URL from /api/cart (ERR_INVALID_URL)`.
- **Consequence:** Internal server requests crash the application process unless provided with an explicit absolute origin or handled through the framework's internal fetch wrapper (such as SvelteKit's `event.fetch`).

---

### 1.7 Route Groups `/(group)` Leaked into Server Route IDs

- **Source:** `packages/features/signals/sveltekit-server/src/index.ts`, `packages/features/signals/nextjs-server/src/index.ts`
- **Mechanism:**
  In both Next.js App Router and SvelteKit, route folders often use route groups like `app/(marketing)/about/page.tsx` or `src/routes/(auth)/login/+page.svelte`.
- **Error Manifestation:**
  The server adapters previously passed raw `event.route.id` or folder route paths directly to telemetry observers.
- **Consequence:** Metrics and observability dashboards recorded routes as `/(marketing)/about` and `/(auth)/login` instead of the canonical public URLs `/about` and `/login`, fracturing analytics paths across different layout groupings.

---

## 2. Importing Connections Errors & Traps

### 2.1 Subpath Export Missing in Framework Wrappers

- **Files:** `packages/features/signals/nextjs/package.json`, `packages/features/signals/sveltekit/package.json`
- **The Issue:**
  The in-app connections dashboard function `mountConnectionsDashboard` is exported **only** from `@techinject/browser/dashboard`.
- **The Error:**
  Developers importing from framework packages encounter module export errors:

  ```ts
  // ❌ Throws: Module '"@techinject/nextjs"' has no exported member 'mountConnectionsDashboard'.
  import { mountConnectionsDashboard } from '@techinject/nextjs';

  // ❌ Throws: Module '"@techinject/sveltekit"' has no exported member 'mountConnectionsDashboard'.
  import { mountConnectionsDashboard } from '@techinject/sveltekit';
  ```

- **Correction:** Must import directly from the browser package subpath:
  ```ts
  import { mountConnectionsDashboard } from '@techinject/browser/dashboard';
  ```

---

### 2.2 Strict Package Manager Transitive Dependency Failure

- **The Issue:**
  Modern package managers (pnpm, Yarn PnP) enforce strict dependency isolation. If a consumer app installs only `@techinject/nextjs`, `@techinject/browser` is installed as a nested transitive dependency.
- **The Error:**
  Attempting to import `@techinject/browser/dashboard` results in:
  ```
  Error: Cannot find module '@techinject/browser/dashboard'
  ```
- **Correction:** The host application's `package.json` must declare `@techinject/browser` as a direct dependency:
  ```json
  {
    "dependencies": {
      "@techinject/nextjs": "^0.1.0-alpha.2",
      "@techinject/browser": "^0.1.0-alpha.2"
    }
  }
  ```

---

### 2.3 SSR / Server Component Crash (`document is not defined`)

- **File:** `packages/features/signals/browser/src/dashboard.ts`
- **The Issue:**
  `mountConnectionsDashboard` executes immediate browser DOM manipulations (`element.ownerDocument`, `document.createElement`, `element.append`).
- **The Error:**
  If the connections page in Next.js App Router omits `'use client'` or if the component is evaluated during server-side pre-rendering:
  ```
  ReferenceError: document is not defined
  ReferenceError: HTMLElement is not defined
  ```
- **Correction:**
  Always mark the file `'use client'` and execute `mountConnectionsDashboard` exclusively inside `useEffect` (Next.js) or `onMount` (SvelteKit).

---

### 2.4 Per-Instance In-Memory Counters

- **File:** `packages/features/signals/browser/src/dashboard.ts`, `packages/features/signals/core/src/index.ts`
- **Behavior:**
  `ConnectionStatus` counts (`sent`, `failed`, `denied`, `dropped`, `invalid`) live only in the current SDK instance. Reloading the page or creating a new instance starts its counts at zero; navigation that keeps the same instance does not reset them.
- **Persistent reporting:**
  The host owns any authenticated, durable aggregation of these local outcomes. Adding SDK persistence would first require a PRD/FRD/design change and validated storage data.

---

### 2.5 "SDK Send Completed" Does NOT Prove Live Upstream Vendor Delivery

- **The Issue:**
  The status card in the connections UI displays `"SDK send completed"`.
- **The Limitation:**
  This status indicates solely that the local browser SDK executed the provider dispatch call without throwing a synchronous JavaScript exception. It does **not** perform an HTTP probe to Google Analytics or Meta servers.
- **Consequence:** If an invalid GA4 Measurement ID (`G-0000000000`) or expired Meta Pixel token is provided, the dashboard will still falsely report `"SDK send completed"`, masking upstream vendor delivery rejections.

---

### 2.6 Server vs. Client Boundary Bundle Crash

- **Source:** `scripts/boundary-check.mjs`
- **The Issue:**
  SignalKit strictly separates browser code from server code. Server adapters depend on Node.js built-ins (`node:async_hooks`, `node:crypto`) and OpenTelemetry SDKs (`@vercel/otel`).
- **The Error:**
  If a developer imports server providers (e.g. `createMetaCapiProvider`, `createOTLPObserver`, or `createServerSignals`) into a client component:
  ```
  Module not found: Can't resolve 'node:async_hooks'
  Module not found: Can't resolve 'node:crypto'
  ```
- **Correction:**
  - Browser/Client components: Import only from `@techinject/browser`, `@techinject/nextjs`, or `@techinject/sveltekit`.
  - Server endpoints/Hooks: Import only from `@techinject/server`, `@techinject/nextjs-server`, or `@techinject/sveltekit-server`.

---

## 3. Safe Implementation Patterns for External Websites

### 3.1 Next.js 15+ Safe Connections Dashboard Route

```tsx
// app/connections/page.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useSignals } from '@techinject/nextjs';
// Direct import from browser subpath
import { mountConnectionsDashboard } from '@techinject/browser/dashboard';

export default function ConnectionsDashboardPage() {
  const signals = useSignals();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Client-side DOM guard
    if (containerRef.current && signals) {
      // Returns teardown function to prevent listener memory leaks
      const cleanup = mountConnectionsDashboard(containerRef.current, signals);
      return cleanup;
    }
  }, [signals]);

  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>SignalKit Connections</h1>
      <p>Local SDK telemetry provider statuses and event dispatch metrics.</p>
      <div ref={containerRef} />
    </main>
  );
}
```

---

### 3.2 SvelteKit Safe Connections Dashboard Route

```svelte
<!-- src/routes/connections/+page.svelte -->
<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { createSvelteKitClient } from '@techinject/sveltekit';
  import { mountConnectionsDashboard } from '@techinject/browser/dashboard';

  const client = getContext<ReturnType<typeof createSvelteKitClient>>('signals');
  let container: HTMLDivElement;

  onMount(() => {
    // Ensure mount runs solely in client browser lifecycle
    const signals = client.mount();
    const cleanup = mountConnectionsDashboard(container, signals);
    return cleanup;
  });
</script>

<svelte:head>
  <title>SignalKit Connections</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main>
  <h1>SignalKit Connections</h1>
  <div bind:this={container}></div>
</main>
```

---

### 3.3 Safe Server SvelteKit Hook Route Guard

To prevent `TypeError: Cannot read properties of undefined (reading 'id')` in SvelteKit 2 or standalone server endpoints:

```ts
// src/hooks.server.ts
import { createSvelteKitHooks } from '@techinject/sveltekit-server';

export const { handle, handleFetch } = createSvelteKitHooks(async (event) => {
  return {
    consent: { analytics: true, marketing: true, observability: true },
    timeoutMs: 2000,
    // Note: Always safe-guard route resolution in custom hooks
  };
});
```

Inside the adapter itself, ensure:

```ts
route: event.route?.id ?? undefined;
```
