# Ads, UTM and search attribution for consumer apps — SignalKit guide

By SignalKit maintainers · 2026-11-04

Keep campaign parameters and referrers intact through routing, capture first and last touch under consent in Next.js, and configure GA4, Google Ads, Microsoft Ads, Meta, Search Console and Bing Webmaster Tools so paid and organic traffic is reported by its real source.

Public route: https://techinjectindia.github.io/signal-kit/guides/ads-utm-search-attribution/

## What attribution needs from your app

Attribution is built from three ingredients that only exist at the moment a visitor lands. The first is the landing URL's query string: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, and the auto-tagged click IDs `gclid`, `gbraid` and `wbraid` (Google Ads), `msclkid` (Microsoft Ads) and `fbclid` (any outbound Facebook click). The second is the referrer host, which is the only evidence an organic search, AI assistant or social visit leaves behind. The third is a stable first-party place to keep the first and last touch until an order is created, usually days later on a different page.

SignalKit's GA4 adapter previously stripped the whole query string and the referrer path from `page_location` and `page_referrer` to keep personal data out of the stream. That protected privacy but removed the only signals GA4 uses to build its channel groups, so every session was reported as Direct. The adapter now keeps the origin, the redacted path and only the parameters in `TRACKING_PARAMETERS`, and sends the referrer origin alone (for example `https://www.google.com/`). Every other parameter and the referrer path and query still never leave the page.

```ts
import { TRACKING_PARAMETERS, safePageLocation, safeReferrer } from '@techinject/browser';

TRACKING_PARAMETERS;
// ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
//  'gclid','gbraid','wbraid','msclkid','fbclid']
safePageLocation('https://shop.example/p/42?gclid=abc&session=secret&email=a@b.c');
// 'https://shop.example/p/:id?gclid=abc'
safeReferrer('https://www.google.com/search?q=notebook');
// 'https://www.google.com/'
```

## Routing best practices (consumer apps)

Every redirect between the ad click and the page that runs your JavaScript is a chance to lose the query string. Apply these rules in order of how often they break attribution in practice.

Never strip the query string in a redirect. The usual offenders are www to apex, http to https, trailing-slash normalization, locale detection and canonical redirects. Next.js `redirects()` in `next.config` forwards the query string by default, so a config redirect is safe unless you add an explicit destination query. Middleware is not safe by default: build the destination from `request.nextUrl` and copy `search`.

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname === 'shop.example') {
    const url = request.nextUrl.clone();
    url.hostname = 'www.shop.example';
    // url.search is preserved by clone(); do not rebuild the URL from pathname alone.
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}
```

Do not `router.replace` the parameters away before capture. `createBrowserSignals` reads `location.href` and `document.referrer` in `start()`, which `SignalKitProvider` calls in its mount effect. If you clean the URL for aesthetics, do it from a component rendered inside the provider, in an effect, so it runs after capture. Cleaning in a layout above the provider, or in middleware, removes the parameters before any client code sees them.

Keep the ad landing page a real route. An interstitial, splash screen, app-download gate or login wall that renders first and then navigates to the real page produces a same-origin referrer and a clean URL, which the SDK treats as internal navigation rather than a new touch. Let the landing page render; present gates after the first paint.

Carry UTMs through app links, deep links and QR codes. A universal link or QR code that resolves to `https://shop.example/offer` with no parameters is a direct visit. Generate the printed or embedded URL with `utm_source=qr&utm_medium=offline&utm_campaign=...` so that the touch is identifiable.

Reserve the `utm_*` and click-ID names. Do not use `utm_term` for your own search box or `utm_content` for A/B variants that mean something else; the SDK and GA4 both interpret those names with fixed meaning.

A consent banner should not navigate. A banner that redirects to `/consent?return=...` and back has the same effect as an interstitial. Render it in place; `setConsent` persists the already-captured touch when the category is granted.

Storage is cookie-less by default. The touch is kept in `localStorage` under the key `signalkit.attribution` on your own origin, so it is unaffected by third-party cookie restrictions. Inject `storage` if you need a cookie-backed store for a subdomain-wide checkout.

## Rendering best practices

Server Components cannot read `window.location` or `document.referrer`; an RSC request may not even carry the original query. Capture only on the client, which is what the SDK does. Do not try to forward `searchParams` from a page into a server-side attribution record for the same reason: that value is a render input, not evidence that this visitor saw the page.

Emit `<link rel="canonical">` without tracking parameters. Search engines must see one URL per product.

Make CDN and ISR cache keys ignore `utm_*` and click IDs. Otherwise every ad click with a unique `gclid` misses the cache, and an ISR page may be revalidated per click. On Vercel, check the Edge Network caching documentation for how `utm_*` and other query parameters enter the cache key of prerendered routes, and normalize the rest in middleware by deleting them from a cloned `nextUrl` passed to `NextResponse.rewrite`, which leaves the browser URL unchanged. On Cloudflare, set a cache rule with "Cache key → Query string → Ignore" for the listed parameters.

Do not key your tree by the URL. A `key={pathname + search}` on a layout forces a remount per navigation, which re-runs effects and can double-fire the landing page view.

Keep hydration stable so the landing page view fires once. Avoid rendering a different tree on the server and client for the landing route; a hydration error that re-renders from scratch delays `start()` and can interleave with your own URL cleanup.

Never render personal data into the URL. The SDK drops any tracking value that contains `@`, control characters or quotes, or exceeds its length budget, but the safest rule is to never put an email, phone or name in a query string in the first place.

If you use a Content Security Policy, allow the providers you enable: `https://www.googletagmanager.com` and `https://www.google-analytics.com` for GA4, `https://connect.facebook.net` for Meta Pixel. Pass your `nonce` to the provider factory when your policy requires it.

## Enable capture in Next.js

Attribution is off by default. Enable it in the browser configuration you pass to `SignalKitProvider`. `category` names the consent category that permits persisting the touch; it defaults to `marketing`. Use `analytics` only if your consent policy treats visit-source storage as measurement rather than advertising.

```tsx
// app/providers.tsx
'use client';
import { SignalKitProvider, createGA4Provider } from '@techinject/nextjs';
import type { Consent } from '@techinject/contracts';

export function Providers({ consent, children }: { consent: Consent; children: React.ReactNode }) {
  return (
    <SignalKitProvider
      config={{
        consent,
        attribution: { category: 'marketing', maxAgeDays: 90 },
        providers: [createGA4Provider({ measurementId: 'G-XXXXXXX' })],
      }}
    >
      {children}
    </SignalKitProvider>
  );
}
```

Read the touch from any client component with `useSignals().getAttribution()`. The result has optional `first` and `last` touches, each with `channel`, `source`, `medium`, optional `campaign`, `campaignId`, `term`, `content` and `clickIds`, plus `landingPath`, `referrerHost` and `timestamp`.

```tsx
'use client';
import { useSignals } from '@techinject/nextjs';

export function PlaceOrderButton({ cartId }: { cartId: string }) {
  const signals = useSignals();
  return (
    <button
      type="button"
      onClick={async () => {
        const { first, last } = signals.getAttribution();
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cartId, attribution: { first, last } }),
        });
      }}
    >
      Place order
    </button>
  );
}
```

Store the touch on the order record your server creates, not in a provider. A column set such as `channel`, `source`, `medium`, `campaign`, `term` and `click_ids` on the order lets you join revenue to campaigns without depending on any vendor's attribution window. Validate the posted object on the server; the browser is not a trusted source and the touch is a hint, not a verified fact.

A few behaviours to rely on rather than discover:

- A direct visit or same-origin navigation never overwrites a stored touch, so a customer who clicked an ad on Monday and typed the URL on Friday still carries Monday's touch.
- The current landing touch is held in memory from `start()`; it is written to storage only once the chosen consent category is granted, and the stored value is removed when that category is withdrawn.
- `first` expires after `maxAgeDays` (default 90, clamped to 1–365).
- Call `signals.clearAttribution()` on logout or account deletion. Consent withdrawal already clears storage.

## Paid search keywords (Google Ads and Microsoft Ads)

Organic search engines do not put the query in the referrer or the landing URL; the referrer is `https://www.google.com/` and nothing more. The only place a keyword can reach your app is a paid click with a tracking template that writes it into `utm_term`.

In Google Ads, keep auto-tagging on so every click carries `gclid` (or `gbraid`/`wbraid` for app and privacy-restricted traffic) and add this final URL suffix at account level:

```sh
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}
```

In Microsoft Ads, keep auto-tagging on for `msclkid` and use the equivalent suffix. Yahoo and DuckDuckGo paid placements are syndicated Microsoft Ads inventory and use the same template.

```sh
utm_source=bing&utm_medium=cpc&utm_campaign={CampaignId}&utm_content={AdId}&utm_term={keyword}
```

The SDK stores `term` from `utm_term`. It classifies any visit carrying `gclid`, `gbraid` or `wbraid` as `paid_search` from `google` with medium `cpc`, and `msclkid` as `paid_search` from `bing`, even when the UTM parameters are missing, so a template mistake costs you the keyword but not the channel. When `utm_medium` is `cpc`, `ppc`, `paid_search` or `sem` and the referrer or `utm_source` is a known engine, the visit is `paid_search`; the same mediums with an unknown source become `paid_other`.

## Meta ads

In Ads Manager, add these URL parameters to the ad so that paid and organic Facebook traffic can be told apart:

```sh
utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

Facebook appends `fbclid` to every outbound click, paid or not. The SDK therefore classifies `fbclid` alone as `organic_social` from `facebook`, and reports `paid_social` only when `utm_medium` says so.

Pass the click ID to the Conversions API from the server. `metaClickCookie(fbclid)` builds the `fb.1.<timestamp>.<fbclid>` value Meta expects in `fbc`; the CAPI provider accepts `fbc` and `fbp` through `userData` and rejects any other unhashed field.

```ts
import { createServerSignals, createMetaCapiProvider } from '@techinject/server';
import { metaClickCookie } from '@techinject/core';

const fbclid = order.attribution?.last?.clickIds?.fbclid;
const fbc = fbclid ? metaClickCookie(fbclid, order.attribution.last.timestamp) : undefined;
const server = createServerSignals({
  consent: orderConsent,
  providers: [
    createMetaCapiProvider({
      pixelId: hostConfig.pixelId,
      accessToken: hostConfig.accessToken,
      apiVersion: hostConfig.graphApiVersion,
      eventSourceUrl: 'https://shop.example/checkout',
      userData: () => ({ external_id: hashedCustomerId, ...(fbc ? { fbc } : {}) }),
    }),
  ],
});
```

The Pixel script loads only after marketing consent is granted, which is usually later than the landing. The SDK captured the `fbclid` in memory at `start()` regardless, so the value is available once consent arrives.

## GA4 settings (no code)

1. Admin → Data streams → your web stream → Enhanced measurement → open the settings and turn off "Page changes based on browser history events". SignalKit sends explicit page views; leaving this on double-counts navigations.
2. Admin → Product links → Google Ads links → link the Ads account and keep "Enable auto-tagging" on. This is what turns a `gclid` into campaign and keyword reporting in GA4.
3. Admin → Product links → Search Console links → link the verified property to expose the "Google organic search queries" report under Reports → Search Console.
4. Admin → Data settings → Data collection → Google signals is optional. Leave it off unless your consent flow grants `ad_personalization`; the SDK sets GA4 consent mode to denied by default and updates only `analytics_storage`.
5. Reports → Acquisition → Traffic acquisition → set the primary dimension to "Session default channel group" and confirm that test clicks appear as Paid Search, Organic Search, Paid Social, Organic Social or Referral rather than Direct.
6. Admin → Data display → Channel groups → create a custom group only if you use mediums outside GA4's defaults (for example `paid_social` is recognized, `sponsored` is not).

## Google Ads, Microsoft Ads and Meta settings (no code)

Google Ads:

1. Admin (gear) → Account settings → Auto-tagging → tick "Tag the URL that people click through from my ad".
2. Admin → Account settings → Tracking → Final URL suffix → paste the Google suffix from the paid search section. Campaign or ad-group level suffixes override this one.
3. Tools → Conversions → confirm the GA4 import or the Google tag, so the `gclid` is matched back to a conversion.

Microsoft Ads:

1. Settings → Account settings → Auto-tagging of Microsoft Click ID → enable.
2. Settings → Account settings → Tracking template or Final URL suffix → paste the Microsoft suffix.
3. Microsoft Ads conversion tracking depends on the UET tag. SignalKit does not load UET; add it through your consent-gated tag manager if you need Microsoft-side conversions. SignalKit's own attribution works from `msclkid` without it.

Meta:

1. In the ad setup, Tracking → Website → URL parameters → "Build a URL parameter" and enter the Meta template from the Meta ads section. Dynamic values such as `{{campaign.name}}` are substituted at click time.
2. Events Manager → your Pixel → Settings → Conversions API → create the system-user access token your server will use. It never belongs in a `NEXT_PUBLIC` variable.

## Organic search terms: Search Console and Bing Webmaster Tools

Organic terms are only available after the fact, from the search engines' reporting APIs. Both report with a delay of roughly two to three days and aggregate by query and page, not by visitor. They are reporting data, not real-time attribution, and cannot be joined to an order.

Before any API call, verify the property (DNS TXT record or the HTML file method) in Google Search Console and in Bing Webmaster Tools, and submit your sitemap in both.

For Google, create an OAuth client in Google Cloud: APIs & Services → Library → enable "Google Search Console API"; APIs & Services → Credentials → Create credentials → OAuth client ID → Web application, with your callback URL as an authorized redirect. Request the read-only scope `https://www.googleapis.com/auth/webmasters.readonly`. Keep the client ID and secret in server-only environment variables.

The SDK never runs the OAuth flow and never stores credentials; your host does both. A minimal pair of route handlers looks like this. It is pseudocode-level: add a signed `state` value, error handling and your own secret store.

```ts
// app/api/search-console/login/route.ts
export function GET() {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_OAUTH_CLIENT_ID!);
  url.searchParams.set('redirect_uri', process.env.GOOGLE_OAUTH_REDIRECT_URI!);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/webmasters.readonly');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return Response.redirect(url, 302);
}
```

```ts
// app/api/search-console/callback/route.ts
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  if (!code) return new Response('Missing code', { status: 400 });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = (await response.json()) as { refresh_token?: string };
  // Persist tokens.refresh_token in your server-side secret store, never in a cookie or the browser.
  await secrets.set('search-console-refresh-token', tokens.refresh_token);
  return Response.redirect(new URL('/admin/search-terms', request.url), 302);
}
```

With a refresh token stored, exchange it for a short-lived access token inside the `accessToken` callback and query the last four weeks. `dimensions` accepts `query`, `page`, `country`, `device` and `date`; `rowLimit` is clamped to 1–5000; `page` filters to one exact URL.

```ts
// app/api/search-terms/route.ts
import {
  createGoogleSearchConsoleClient,
  createBingWebmasterClient,
  mergeSearchRows,
} from '@techinject/server/search-console';

async function refreshAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: await secrets.get('search-console-refresh-token'),
      grant_type: 'refresh_token',
    }),
  });
  return ((await response.json()) as { access_token: string }).access_token;
}

export async function GET() {
  const google = createGoogleSearchConsoleClient({
    siteUrl: 'sc-domain:shop.example',
    accessToken: refreshAccessToken,
  });
  const bing = createBingWebmasterClient({
    siteUrl: 'https://shop.example/',
    apiKey: process.env.BING_WEBMASTER_API_KEY!,
  });
  const day = (offset: number) =>
    new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const request = {
    startDate: day(30),
    endDate: day(3),
    dimensions: ['query' as const],
    rowLimit: 50,
  };
  const results = await Promise.allSettled([google.queries(request), bing.queries(request)]);
  const rows = mergeSearchRows(
    results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
  );
  return Response.json({ rows });
}
```

For Bing, open Webmaster Tools → Settings (gear) → API access → "Generate API key". The key is passed as a query parameter by Bing's API, so it is server-only as well. `createBingWebmasterClient` reads `GetQueryStats`, or `GetPageQueryStats` when you pass `page` with the `page` dimension, aggregates rows per query and filters them to your date range.

`mergeSearchRows` flattens the arrays and sorts by clicks then impressions. Each row carries `engine`, the requested dimensions, `clicks`, `impressions`, `ctr` (0–1) and `position`. Errors from either client are plain messages such as "Search console request rejected" and never include the token, API key, the request URL or the provider's response body, so they are safe to log.

## AI search and other sources

Visits referred from `chatgpt.com`, `perplexity.ai`, `gemini.google.com`, `claude.ai`, `copilot.microsoft.com`, `you.com` and `mistral.ai` are classified as `ai_search` with the assistant as `source` and medium `ai`. These assistants do not pass the prompt, so no keyword is available and none of the reporting APIs above cover them.

Other hosts fall through to `organic_search`, `organic_social` or `referral` using the engine and social-network tables, with `www.` removed from referral sources. Any link you place yourself, in an email, a partner page, a bio, a print campaign or a chatbot answer you control, should carry its own UTMs (`utm_medium=email`, `referral`, `social`), because a referrer can be dropped by the sending platform and a direct visit tells you nothing.

## Verify before you trust it

Run the local Next.js lab and open it with `?gclid=test` or `?utm_source=bing&utm_medium=cpc&utm_term=notebook`. The "Visit source" card in the header shows the first and last touch, and grant marketing consent to see the value persist across a reload.

```sh
git clone --branch main https://github.com/TechInjectIndia/signal-kit.git
cd signal-kit
bun install --frozen-lockfile
bun run build
bun run --filter @signalkit/example-nextjs dev
# http://localhost:3000/?gclid=test
```

## Run the self-check

Most attribution loss comes from the routing and rendering rules above, and they are platform configuration rather than SDK code, so the SDK ships a runtime self-check instead of a per-framework linter. `auditAttribution` runs in the page, in any framework and any version, and reports the mistakes it can observe from the live document, URL and navigation timing. It is synchronous, never throws, makes no network request and returns an array of findings with a stable `id`, a `severity` (`error`, `warning` or `info`), a `message` and a `hint`.

```ts
import { auditAttribution } from '@techinject/nextjs'; // or @techinject/browser, @techinject/sveltekit

// After the provider has mounted (a dev-only button, effect or console helper):
const findings = auditAttribution({ signals });
for (const f of findings) console[f.severity === 'info' ? 'info' : 'warn'](f.id, f.message, f.hint);
```

| id                              | severity | what it means                                                                                                                                            |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attribution-disabled`          | warning  | `signals` was passed but `attribution` is not enabled in its config.                                                                                     |
| `params-dropped-by-redirect`    | warning  | The navigation passed through one or more redirects, landed without any tracking parameter, and the referrer is a known search, AI or social host.       |
| `params-removed-before-capture` | error    | The landing URL (from navigation timing) or the current URL carried tracking parameters, but `getAttribution()` is empty: a router removed them first.   |
| `canonical-has-tracking-params` | error    | A `<link rel="canonical">` href contains a `utm_*` or click-ID parameter.                                                                                |
| `csp-blocks-vendor`             | error    | A `<meta http-equiv="Content-Security-Policy">` script-src omits `googletagmanager.com` or `connect.facebook.net` while GA4 or Meta Pixel is configured. |
| `storage-unavailable`           | warning  | `localStorage` is missing or throws, so the touch cannot persist across pages.                                                                           |
| `consent-never-granted`         | info     | The attribution consent category is still denied; the touch is held in memory only.                                                                      |
| `multiple-sdk-instances`        | warning  | Another SDK instance tried to start while one was active.                                                                                                |

Pass `expectedHosts` to require extra script hosts in the policy (for example a server-side tagging domain). Inject `document`, `location` or `performance` to audit from tests. The check only sees a meta-tag CSP, not a header, and it reports what the running page shows, so run it on the real landing URL with its real referrer, for example by clicking your own ad preview. The Next.js lab has an "Audit attribution" button in the inspector that renders the findings.

With a real GA4 stream configured, open GA4 DebugView and confirm the `page_view` has a `page_location` that still contains `gclid`, and a `page_referrer` with the referrer origin only. Then check Reports → Acquisition the next day.

Local tests exercise fixtures: the classification table, storage under consent, the redacted `page_location` and the Search Console and Bing response shapes. They do not establish that GA4, Google Ads or Meta attributed a real purchase. The lab's `/api/search-terms` route returns `{ configured: false, rows: [] }` until you set `SEARCH_CONSOLE_SITE_URL`, `SEARCH_CONSOLE_ACCESS_TOKEN`, `BING_WEBMASTER_SITE_URL` and `BING_WEBMASTER_API_KEY` in its environment; it does not fabricate rows.

## Privacy boundaries

Only the eleven parameters in `TRACKING_PARAMETERS` can leave the page, and only on `page_location`. Every other parameter is removed before any provider sees the URL. A tracking value that contains `@`, a control character, angle brackets or quotes, or that exceeds its length budget (256 characters for click IDs, 100–200 for UTMs) is dropped rather than truncated.

The referrer is reduced to its scheme and host. Its path, query, fragment and any credentials never leave the page, and a same-origin referrer is not reported as a touch at all.

Nothing is persisted before consent. The landing touch lives in memory until the chosen consent category is granted; withdrawal removes the stored value. The `maxAgeDays` ceiling bounds first-touch retention, and your host owns retention of whatever it copies onto an order. The SDK stores no credentials for Search Console or Bing and never includes them in errors or diagnostics.
