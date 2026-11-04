export const sourceRef = 'main';
export const repository = 'https://github.com/TechInjectIndia/signal-kit';
export const faq = [
  [
    'What is SignalKit?',
    'SignalKit is an open-source, consent-aware ecommerce telemetry SDK. It gives Next.js, Bun and SvelteKit projects shared typed events, page and request instrumentation, and adapters for analytics and observability providers.',
  ],
  [
    'Is SignalKit available on npm?',
    'Yes. Alpha 0.1.0-alpha.2 is available on npm. Pin the @techinject packages to this exact version, or use the workspace.',
  ],
  [
    'Which frameworks does SignalKit support?',
    'Next.js, Bun and SvelteKit 3 / Svelte 5 on the Node runtime are current alpha integrations. Next Edge is unsupported. Coming soon: Hono, Astro, standalone Node.js, HTML/vanilla JavaScript, Django, Laravel, FastAPI, Spring Boot, Express, Fastify, NestJS, CodeIgniter, Vue and Angular. Their dedicated integrations are pending development, with no committed release dates.',
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
    'No SignalKit account or hosted collector is required. Configure your own provider accounts and, when using OTLP, your own compatible collector. An optional in-app connections dashboard shows SDK event-provider outcomes; it is not a hosted analytics reporting service.',
  ],
  [
    'What has been tested?',
    'The v1 build recorded 33 tests, local browser and Bun runtime checks, a Next production build and a local OpenTelemetry recorder. Provider scripts and payloads were checked with fixtures, not live attribution. The browser adapter bundle measured 13.3 kB gzip with attribution capture, excluding vendor scripts and React.',
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
    title: 'SignalKit documentation — choose your platform integration',
    description:
      'Build SignalKit locally, connect a Next.js root provider or Bun request wrapper, and understand consent, verified purchases and server-only credentials.',
    label: 'Documentation',
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
          'Use Bun 1.4.4 or newer. Start both hosts in separate terminals. The Next lab and Bun fixture let you inspect denied consent, permitted events and verified synthetic payment replay without real provider credentials.',
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
          'The repository’s local tests establish fixture behavior. They do not establish that GA4 or Meta attributed a real customer purchase. The npm alpha is available with explicit 0.1.0-alpha.2 version pins.',
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
          'This code is a complete local server that prints safe records through an injected observer. Save it as examples/bun/trace-demo.ts inside the built workspace, then run bun trace-demo.ts from examples/bun. Technical consent here is for the synthetic fixture; your real host supplies its own policy.',
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
  {
    path: 'guides/ads-utm-search-attribution/',
    title: 'Ads, UTM and search attribution for consumer apps — SignalKit guide',
    label: 'Ads, UTM and search attribution',
    description:
      'Keep campaign parameters and referrers intact through routing, capture first and last touch under consent in Next.js, and configure GA4, Google Ads, Microsoft Ads, Meta, Search Console and Bing Webmaster Tools.',
    datePublished: '2026-11-04',
    sections: [
      {
        title: 'What attribution needs from your app',
        paragraphs: [
          'Attribution is built from three ingredients that exist only when a visitor lands: the query string (utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id and the click IDs gclid, gbraid, wbraid, msclkid and fbclid), the referrer host, and a stable first-party place to keep the first and last touch until an order is created.',
          'The GA4 adapter previously stripped the whole query string and the referrer path to keep personal data out of the stream, which made every session Direct. It now keeps the origin, the redacted path and only the parameters in TRACKING_PARAMETERS on page_location, and sends the referrer origin alone. Every other parameter and the referrer path and query still never leave the page.',
        ],
        code: `import { TRACKING_PARAMETERS, safePageLocation, safeReferrer } from '@techinject/browser';

safePageLocation('https://shop.example/p/42?gclid=abc&session=secret&email=a@b.c');
// 'https://shop.example/p/:id?gclid=abc'
safeReferrer('https://www.google.com/search?q=notebook');
// 'https://www.google.com/'`,
        label: 'Allowlisted page_location and referrer origin',
      },
      {
        title: 'Routing best practices for consumer apps',
        paragraphs: [
          'Every redirect between the ad click and the page that runs your JavaScript can lose the query string. Next.js redirects() in next.config forwards it by default; middleware does not unless you build the destination from request.nextUrl so its search is kept.',
          'createBrowserSignals reads location.href and document.referrer in start(), which SignalKitProvider calls in its mount effect. Clean the URL only from a component inside the provider, in an effect, so cleanup runs after capture. Keep the ad landing page a real route: an interstitial or login wall that navigates produces a same-origin referrer and a clean URL, which the SDK treats as internal navigation rather than a new touch.',
        ],
        code: `import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname === 'shop.example') {
    const url = request.nextUrl.clone();
    url.hostname = 'www.shop.example';
    // url.search survives clone(); do not rebuild from pathname alone.
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}`,
        label: 'middleware.ts',
        bullets: [
          'Carry UTMs through app links, deep links and QR codes; a bare universal link is a direct visit.',
          'Reserve the utm_* and click-ID names; do not reuse utm_term for your own search box.',
          'Render the consent banner in place. A banner that redirects away and back behaves like an interstitial.',
          'Storage is cookie-less: the touch lives in localStorage on your origin under signalkit.attribution; inject storage for a cookie-backed store.',
        ],
      },
      {
        title: 'Rendering best practices',
        paragraphs: [
          'Server Components cannot read window.location or document.referrer, so capture only on the client, which is what the SDK does. Emit the canonical link without tracking parameters, and make CDN and ISR cache keys ignore utm_* and click IDs so each unique gclid does not miss the cache.',
          'Do not key a layout by pathname plus search; the remount re-runs effects and can double-fire the landing page view. Keep hydration stable so the landing view fires once, never put an email or phone number in a URL, and allow googletagmanager.com, google-analytics.com and connect.facebook.net in your Content Security Policy for the providers you enable.',
        ],
      },
      {
        title: 'Enable capture in Next.js',
        paragraphs: [
          'Attribution is off by default. Enable it in the browser configuration passed to SignalKitProvider; category names the consent category that permits persisting the touch and defaults to marketing. Read the touch anywhere with useSignals().getAttribution(), then post first and last to your own order endpoint so the order record stores channel, source, medium, campaign, term and click IDs. Validate the posted object on the server; the browser is not a trusted source.',
        ],
        code: `'use client';
import { SignalKitProvider, useSignals, createGA4Provider } from '@techinject/nextjs';

export function Providers({ consent, children }) {
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

export function PlaceOrderButton({ cartId }) {
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
}`,
        label: 'app/providers.tsx and a checkout button',
        bullets: [
          'A direct visit or same-origin navigation never overwrites a stored touch.',
          'The landing touch is held in memory from start() and written to storage only once the chosen consent category is granted; withdrawal removes it.',
          'first expires after maxAgeDays (default 90, clamped to 1–365).',
          'Call signals.clearAttribution() on logout or account deletion.',
        ],
      },
      {
        title: 'Paid search keywords and Meta ads',
        paragraphs: [
          'Organic engines never put the query in the referrer or landing URL. A keyword reaches your app only through a paid click whose tracking template writes it into utm_term. Keep auto-tagging on in Google Ads (gclid, gbraid, wbraid) and Microsoft Ads (msclkid); Yahoo and DuckDuckGo paid placements are syndicated Microsoft Ads inventory and use the same template. The SDK stores term from utm_term and classifies any gclid, gbraid, wbraid or msclkid click as paid_search even when UTMs are missing.',
          'Facebook appends fbclid to every outbound click, paid or not, so the SDK reports fbclid alone as organic_social and paid_social only when utm_medium says so. On the server, metaClickCookie(fbclid) from @techinject/core builds the fbc value the Conversions API provider accepts in userData. The Pixel loads only after marketing consent, but the SDK captured the fbclid in memory at start() regardless.',
        ],
        code: `# Google Ads final URL suffix (account level, auto-tagging on)
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}

# Microsoft Ads final URL suffix (auto-tagging on)
utm_source=bing&utm_medium=cpc&utm_campaign={CampaignId}&utm_content={AdId}&utm_term={keyword}

# Meta Ads Manager URL parameters
utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}`,
        label: 'Tracking templates',
      },
      {
        title: 'GA4, Google Ads, Microsoft Ads and Meta settings (no code)',
        paragraphs: [
          'GA4: Admin → Data streams → Enhanced measurement → turn off “Page changes based on browser history events” because SignalKit sends explicit page views. Admin → Product links → link Google Ads with auto-tagging and link the verified Search Console property. Google signals under Data collection is optional and consent-gated. Verify under Reports → Acquisition → Traffic acquisition that test clicks appear as Paid Search, Organic Search or Paid Social rather than Direct, and create a custom channel group only for mediums outside GA4 defaults.',
          'Google Ads: Admin → Account settings → enable auto-tagging and paste the final URL suffix under Tracking. Microsoft Ads: Settings → Account settings → enable auto-tagging of the Microsoft Click ID and set the suffix; Microsoft conversion tracking needs the UET tag, which SignalKit does not load. Meta: in the ad setup use Tracking → URL parameters → “Build a URL parameter”, and create the Conversions API system-user token under Events Manager → Settings; it never belongs in a NEXT_PUBLIC variable.',
        ],
      },
      {
        title: 'Organic search terms from Search Console and Bing Webmaster Tools',
        paragraphs: [
          'Organic terms are only available after the fact from the engines’ reporting APIs, with a delay of roughly two to three days and aggregated by query and page, not by visitor. They are reporting data, not real-time attribution. Verify the property by DNS or HTML file in both tools and submit your sitemap.',
          'For Google, enable the Google Search Console API in Google Cloud, create an OAuth web client, and request the scope https://www.googleapis.com/auth/webmasters.readonly with access_type=offline. Your host runs the login and callback routes, exchanges the code at https://oauth2.googleapis.com/token and stores the refresh token server-side under GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, never in NEXT_PUBLIC. For Bing, open Webmaster Tools → Settings → API access → Generate API key. The SDK never runs the OAuth flow or stores credentials, and its errors never include a token, API key or provider body.',
        ],
        code: `import {
  createGoogleSearchConsoleClient,
  createBingWebmasterClient,
  mergeSearchRows,
} from '@techinject/server/search-console';

export async function GET() {
  const google = createGoogleSearchConsoleClient({
    siteUrl: 'sc-domain:shop.example',
    accessToken: refreshAccessToken, // exchanges the stored refresh token server-side
  });
  const bing = createBingWebmasterClient({
    siteUrl: 'https://shop.example/',
    apiKey: process.env.BING_WEBMASTER_API_KEY!,
  });
  const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const request = { startDate: day(30), endDate: day(3), dimensions: ['query'], rowLimit: 50 };
  const results = await Promise.allSettled([google.queries(request), bing.queries(request)]);
  const rows = mergeSearchRows(
    results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
  );
  return Response.json({ rows });
}`,
        label: 'app/api/search-terms/route.ts',
      },
      {
        title: 'AI search and other sources',
        paragraphs: [
          'Visits referred from chatgpt.com, perplexity.ai, gemini.google.com, claude.ai, copilot.microsoft.com, you.com and mistral.ai are classified as ai_search with medium ai. These assistants do not pass the prompt, so no keyword is available and the reporting APIs above do not cover them. Other hosts fall through to organic_search, organic_social or referral. UTM-tag any link you place yourself, in an email, partner page, bio or print campaign, because a referrer can be dropped by the sending platform.',
        ],
      },
      {
        title: 'Run the self-check',
        paragraphs: [
          'The routing and rendering rules are platform configuration, not SDK code, so the SDK ships a runtime self-check instead of a per-framework linter. auditAttribution runs in the page in any framework and version and reports what it can observe from the live document, URL and navigation timing: attribution-disabled, params-dropped-by-redirect, params-removed-before-capture, canonical-has-tracking-params, csp-blocks-vendor (meta-tag policies only), storage-unavailable, consent-never-granted and multiple-sdk-instances. Each finding has a stable id, a severity of error, warning or info, a message and a hint. It is synchronous, never throws and makes no network request. Call it after the provider has mounted; the Next.js lab has an “Audit attribution” button in the inspector.',
        ],
        code: `import { auditAttribution } from '@techinject/nextjs'; // or @techinject/browser, @techinject/sveltekit

const findings = auditAttribution({ signals });
for (const f of findings) console.warn(f.id, f.message, f.hint);`,
        label: 'dev-only helper',
      },
      {
        title: 'Verify before you trust it, and what stays private',
        paragraphs: [
          'Run the Next.js lab and open it with ?gclid=test or ?utm_source=bing&utm_medium=cpc&utm_term=notebook; the “Visit source” card shows the first and last touch, and granting marketing consent persists it across a reload. With a real GA4 stream, DebugView should show page_location still carrying gclid and page_referrer as the referrer origin. Local tests are fixture evidence; they do not establish that GA4, Google Ads or Meta attributed a real purchase. The lab’s /api/search-terms returns configured:false until the Search Console and Bing environment variables are set.',
          'Only the eleven allowlisted parameters can leave the page, and only on page_location. A value containing @, control characters, angle brackets or quotes, or exceeding its length budget, is dropped. The referrer is reduced to scheme and host. Nothing is persisted before consent, withdrawal clears storage, maxAgeDays bounds first-touch retention, and your host owns retention of whatever it copies onto an order.',
        ],
        setup: true,
        links: [
          [
            'https://support.google.com/analytics/answer/9756891',
            'GA4 default channel group definitions',
          ],
          [
            'https://developers.google.com/webmaster-tools/v1/searchanalytics/query',
            'Search Console Search Analytics query reference',
          ],
        ],
      },
    ],
  },
];
pages.push(
  {
    path: 'guides/',
    title: 'SignalKit guides — ecommerce tracking, attribution and Bun API tracing',
    description:
      'Practical guides to verified Next.js purchases, coordinated Meta Pixel and CAPI IDs, ads, UTM and search attribution, and Bun API tracing with runnable local examples.',
    label: 'Guides',
  },
  ...guides,
);
