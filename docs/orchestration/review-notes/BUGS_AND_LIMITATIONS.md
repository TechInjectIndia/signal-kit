# Comprehensive Bug, Defect, and Architectural Limitation Report: SignalKit

This document provides an exhaustive inventory of all confirmed bugs, framework incompatibilities, data loss mechanisms, routing edge cases, and architectural limitations across the SignalKit repository.

---

## 1. Critical & Functional Bugs

### 1.1 Server `fetch` Crashes on Relative URLs

- **File:** [`packages/features/signals/server/src/index.ts`](../../../packages/features/signals/server/src/index.ts#L65-L91)
- **Problem:** When server-side code calls `signals.fetch('/api/cart')` with a relative URL, the wrapper executes:
  ```ts
  const request = new Request(input, init);
  ...
  (config.traceOrigins ?? []).includes(new URL(request.url).origin)
  ```
  In Node.js, `new Request('/api/cart')` and `new URL('/api/cart')` without a base URL throw an unhandled `TypeError: Failed to parse URL from /api/cart (ERR_INVALID_URL)`.
- **Impact:** Any internal or relative fetch called through `signals.fetch` crashes the application process.

### 1.2 Campaign Tracking & Ad Attribution Stripped in GA4 (`gclid` / UTMs Destroyed)

- **File:** [`packages/features/signals/browser/src/providers.ts`](../../../packages/features/signals/browser/src/providers.ts#L93-L113)
- **Problem:** GA4 initialization and event dispatches compute:
  ```ts
  page_location: location.origin + safeRoute(location.href),
  page_referrer: document.referrer ? safeRoute(document.referrer) : '',
  ```
  `safeRoute` strips everything after the query mark `?`. Consequently, all query parameters—including `utm_source`, `utm_medium`, `utm_campaign`, `gclid` (Google Ads), and `fbclid` (Facebook)—are removed before reaching GA4.
- **Impact:** Google Analytics 4 cannot attribute ad spend or campaign traffic; all visits appear as untracked direct or organic traffic.

### 1.3 Meta CAPI Destroys `fbclid` in `event_source_url`

- **File:** [`packages/features/signals/server/src/index.ts`](../../../packages/features/signals/server/src/index.ts#L231-L238)
- **Problem:** In Meta Conversions API (CAPI), the source URL is sanitized with:
  ```ts
  const source = options.eventSourceUrl ? new URL(options.eventSourceUrl) : undefined;
  if (source) {
    source.pathname = safeRoute(source);
    source.search = '';
    source.hash = '';
  }
  ```
- **Impact:** Setting `source.search = ''` strips the query string containing `fbclid`. Because Meta CAPI relies on `fbclid` in `event_source_url` for attribution matching, event match quality and ad attribution are degraded.

### 1.4 Meta CAPI Crash on Plaintext PII & Rejection of Standard Parameters

- **File:** [`packages/features/signals/server/src/index.ts`](../../../packages/features/signals/server/src/index.ts#L195-L221)
- **Problem:**
  1. `safeUserData` strictly enforces that `em`, `ph`, and `external_id` match `/^[a-f0-9]{64}$/i`. Passing plain-text emails or phone numbers throws `Error('Invalid hashed matching data')` rather than hashing them or handling them safely.
  2. Passing any standard Meta user-matching field beyond the 5 hardcoded keys (`em`, `ph`, `external_id`, `fbp`, `fbc`) throws `Error('Unsupported matching data')`.
  3. Common parameters recommended by Meta for Conversions API Event Quality Match Score (`client_ip_address`, `client_user_agent`, `fn` [first name], `ln` [last name], `ct` [city], `zp` [postal code], `country`) are completely omitted from the payload and cannot be supplied.

### 1.5 OTLP Observer Floating-Point Precision Loss on Nanosecond Timestamps

- **File:** [`packages/features/signals/server/src/index.ts`](../../../packages/features/signals/server/src/index.ts#L349-L350)
- **Problem:** `startTimeUnixNano` is calculated via:
  ```ts
  startTimeUnixNano: String(BigInt(Math.floor(start * 1_000_000))),
  ```
  `start` is milliseconds since Unix epoch (~`1.79e12`). Multiplying by `1_000_000` produces ~`1.79e18`, which exceeds `Number.MAX_SAFE_INTEGER` (`9,007,199,254,740,991` ≈ `9e15`) by a factor of 200.
- **Impact:** JavaScript IEEE 754 floating-point precision loss corrupts the lower-order digits of the nanosecond timestamp before it is converted to `BigInt`. (In contrast, `endTimeUnixNano` correctly uses `BigInt(end) * 1_000_000n`).

### 1.6 OTLP Collector Non-JSON 200 OK Causes False Error Diagnosis

- **File:** [`packages/features/signals/server/src/index.ts`](../../../packages/features/signals/server/src/index.ts#L380-L391)
- **Problem:** When an OTLP collector returns HTTP 200 with an empty body or non-JSON text (such as plain-text `"OK"`), `JSON.parse(text)` throws a `SyntaxError`. The `.catch()` handler then misinterprets this as an unhandled transport failure and triggers `diagnostic('transport')`.

---

## 2. Event Contract & Schema Limitations

### 2.1 Missing Lead & Action Events

- **File:** [`packages/features/signals/contracts/src/index.ts`](../../../packages/features/signals/contracts/src/index.ts#L23-L28)
- **Problem:** The `EventName` type and `schemas` dictionary are strictly restricted to 5 ecommerce events:
  - `page_view`
  - `product_view`
  - `add_to_cart`
  - `begin_checkout`
  - `purchase`
- **Impact:** Important business lead actions (`generate_lead`, `phone_click`, `whatsapp_click`, `sign_up`, `login`, `search`, `custom_event`) are rejected by `sanitizeEvent` and flagged as `'invalid'`.

### 2.2 Strict Schema Strips All Custom Metadata and Standard Ecommerce Properties

- **File:** [`packages/features/signals/contracts/src/index.ts`](../../../packages/features/signals/contracts/src/index.ts#L85-L106)
- **Problem:** The schema uses strict object validation. Any field not explicitly declared in `item`, `commerce`, or `purchase` is **silently stripped**:
  - Item fields allowed: `item_id`, `item_name`, `price`, `quantity`, `item_category`.
  - Stripped item fields: `item_brand`, `item_variant`, `coupon`, `discount`.
  - Stripped commerce fields: `shipping`, `tax`, `coupon`, `affiliation`, `payment_type`, `user_id`, custom tags.

### 2.3 `product_view` Inappropriately Forces Cart Data Structure

- **File:** [`packages/features/signals/contracts/src/index.ts`](../../../packages/features/signals/contracts/src/index.ts#L102)
- **Problem:** `product_view` shares the exact same `commerce` schema as `add_to_cart` and `begin_checkout`:
  ```ts
  const commerce = object({
    currency,
    value: amount,
    items: array(item).check(minLength(1), maxLength(100)),
  });
  ```
- **Impact:** Emitting a view on a product page where currency is not yet chosen, price is 0, or passing a simple item shape without a full cart wrapper (`currency`, `value`, `items`) fails validation and drops the event.

### 2.4 Empty Cart / Checkout Rejection

- **File:** [`packages/features/signals/contracts/src/index.ts`](../../../packages/features/signals/contracts/src/index.ts#L98)
- **Problem:** `items` enforces `minLength(1)`. Initiating checkout with an empty cart or emitting an event with `items: []` is treated as invalid and dropped.

---

## 3. Framework Compatibility & Runtime Deficiencies

### 3.1 SvelteKit 2 & Svelte 5 Incompatibility

- **Files:** [`packages/features/signals/sveltekit-server/package.json`](../../../packages/features/signals/sveltekit-server/package.json#L25-L31), [`docs/COMPATIBILITY.md`](../../COMPATIBILITY.md#L30-L33)
- **Problem:** `@techinject/sveltekit-server` declares:
  ```json
  "peerDependencies": {
    "@sveltejs/kit": ">=3 <4"
  },
  "engines": {
    "node": ">=22"
  }
  ```
  Test fixtures and verification only target SvelteKit `3.0.1`. SvelteKit 2 is unverified, uncertified, and will fail package manager peer dependency checks.

### 3.2 Next.js Version Constraints & Edge Runtime Unsupported

- **Files:** [`packages/features/signals/nextjs/package.json`](../../../packages/features/signals/nextjs/package.json#L26-L29), [`docs/COMPATIBILITY.md`](../../COMPATIBILITY.md#L16)
- **Problem:**
  1. Next.js peer dependency is pinned to `"next": ">=15 <17"` and `"react": ">=18 <20"`. Next.js 14, 13, and Pages Router are unsupported.
  2. Next.js Edge runtime is explicitly unsupported (`docs/COMPATIBILITY.md`: `Next Edge: unsupported`). Only the Node.js runtime is supported.

### 3.3 Bun Route Table Bypass

- **File:** [`packages/features/signals/bun/src/index.ts`](../../../packages/features/signals/bun/src/index.ts#L4-L11)
- **Problem:** SignalKit intentionally avoids monkey-patching global `fetch`. In Bun, `instrumentBunFetch` only intercepts the fallback `fetch` handler. Endpoints defined in Bun's declarative `routes` table completely bypass telemetry unless every route is wrapped individually by hand.

### 3.4 Unimplemented Proposed Platforms

- **Problem:** Documentation mentions upcoming support for Astro, Hono, Express, Fastify, NestJS, Nuxt, Vue, Angular, Django, Laravel, and Spring Boot. There is zero implementation code or adapters for any of these platforms in the repository.

---

## 4. Routing & Navigation Edge Cases

### 4.1 Non-UUID Alphanumeric IDs Exposed in Recorded Routes

- **File:** [`packages/features/signals/core/src/index.ts`](../../../packages/features/signals/core/src/index.ts#L49-L70)
- **Problem:** `safeRoute` only replaces purely numeric segments (`/[0-9]+/`) and standard 36-character UUIDs.
- **Impact:** Alphanumeric IDs such as MongoDB ObjectIDs (`/users/507f1f77bcf86cd799439011`), Stripe IDs (`/orders/cs_test_a1b2c3d4`), NanoIDs, CUIDs, or order numbers (`/orders/ORD-98721`) are **not redacted** and will leak into analytics and observability routes unless a manual route template is provided.

### 4.2 SvelteKit & Next.js Route Groups Leaked into Telemetry

- **File:** [`packages/features/signals/sveltekit-server/src/index.ts`](../../../packages/features/signals/sveltekit-server/src/index.ts#L24)
- **Problem:** Passing SvelteKit's `event.route.id` or Next.js route folders as route templates preserves layout route groups like `/(marketing)/about` or `/(app)/dashboard` instead of recording the canonical public URL `/about` or `/dashboard`.

### 4.3 Hash and Query SPA Navigation Ignored

- **File:** [`packages/features/signals/browser/src/index.ts`](../../../packages/features/signals/browser/src/index.ts#L63-L69)
- **Problem:** Navigation tracking relies on comparing `location.pathname === lastPath`.
- **Impact:** Hash routing (e.g., `/#/catalog`, `/#/checkout`) and query parameter navigation (e.g., `?tab=orders`, `?page=2`) never trigger an automatic `page_view`.

### 4.4 Singleton Browser Instance Collision

- **File:** [`packages/features/signals/browser/src/index.ts`](../../../packages/features/signals/browser/src/index.ts#L10), [`#L71-L73`](../../../packages/features/signals/browser/src/index.ts#L71-L73)
- **Problem:** `createBrowserSignals` guards lifecycle start with a module-scoped `activeOwner` variable. If multiple instances are initialized on the same page (e.g. in microfrontends, embedded store widgets, or Hot Module Reloading), all subsequent instances silently fail to start.

---

## 5. Telemetry & Observability Gaps

### 5.1 Next.js Error Handler Emits Orphan Traces

- **File:** [`packages/features/signals/nextjs-server/src/index.ts`](../../../packages/features/signals/nextjs-server/src/index.ts#L31-L38)
- **Problem:** `createNextRequestErrorHandler` constructs error records without `traceId`, `spanId`, or `parentSpanId`.
- **Impact:** Error records cannot be linked or correlated to the incoming request trace in OpenTelemetry / SigNoz collectors.

### 5.2 Silent Telemetry Dropping Under Concurrency

- **Files:** [`packages/features/signals/browser/src/index.ts`](../../../packages/features/signals/browser/src/index.ts#L57), [`packages/features/signals/server/src/index.ts`](../../../packages/features/signals/server/src/index.ts#L46)
- **Problem:**
  - Browser: When `pendingRecords.size >= 32`, all subsequent network observation records are silently dropped.
  - Server: When `observations.size >= maxObservations` (default 20), records are dropped without any diagnostic notification.

### 5.3 No Browser Error or Crash Monitoring

- **Problem:** The SDK only records `fetch` and `XMLHttpRequest` requests. It contains no capture logic for `window.onerror`, unhandled promise rejections, or browser crashes.

---

## 6. Consent & Durability Deficiencies

### 6.1 Consent Denied Permanently Drops Events (No Queueing)

- **File:** [`packages/features/signals/core/src/index.ts`](../../../packages/features/signals/core/src/index.ts#L155-L156)
- **Problem:** Browser consent defaults to denied (`DENIED_CONSENT`). Events emitted before the user accepts cookies/consent are immediately discarded. There is no queueing or replay mechanism when consent is subsequently granted.

### 6.2 Zero Persistence / In-Memory Only

- **Problem:** There is no `IndexedDB` or `localStorage` buffering. Page unloads, browser closures, or network drops will lose all in-flight events.

### 6.3 Connections Dashboard Counters Are Ephemeral

- **File:** [`packages/features/signals/browser/src/dashboard.ts`](../../../packages/features/signals/browser/src/dashboard.ts#L18)
- **Problem:** Counter data is stored in memory per instance. Refreshing the browser or restarting a server resets all attempt, success, and failure counts to zero. The dashboard also does not verify upstream API connectivity.
