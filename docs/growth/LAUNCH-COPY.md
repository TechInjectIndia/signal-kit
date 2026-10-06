# SignalKit launch copy

Status: drafts for human review; no posts or outreach sent. Package installation language must be updated only after a verified registry release. Replace any channel-specific link with the canonical guide URL and its UTM parameters below. The site itself has no analytics collection or third-party cookies; UTM query strings label links but do not provide visitor metrics by themselves.

## LinkedIn: problem and prototype

A checkout success page is a poor source of purchase truth. It can reload, disappear before tracking, or be reached without a captured payment.

We built SignalKit as an open-source prototype for Next.js storefronts and Bun APIs: typed ecommerce events, consent controls and adapters for GA4, Meta Pixel/CAPI and OTLP. Purchases still come from verified host order state. Your host persists event IDs and owns durable delivery.

The workspace has runnable labs and three practical guides. Packages are currently unpublished. Local tests check behavior and payloads; they do not establish live attribution or Meta deduplication.

If you maintain an ecommerce project, try the local lab and tell us which setup step feels unnecessary. We are especially looking for feedback on consent integration and event IDs across browser/server copies.

https://techinjectindia.github.io/signal-kit/guides/nextjs-purchase-tracking/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=alpha_guides

## Next.js community: permitted showcase or feedback thread

Built an open-source prototype for consent-aware ecommerce events in Next.js. The guide focuses on verified purchase state, stable event IDs and the limits of tracking from a thank-you page.

Next App Router / Node is the initial host; Edge is unsupported. Browser pages and fetch/XHR are instrumented, while host-wide Next OpenTelemetry is a separate integration. Packages are unpublished, so the guide uses a workspace clone and runnable lab.

Feedback request: could you run the lab and identify the first unclear setup or consent step? No production keys needed. Please use synthetic data and sanitized reports.

https://techinjectindia.github.io/signal-kit/guides/nextjs-purchase-tracking/?utm_source=nextjs_community&utm_medium=community&utm_campaign=alpha_guides

Post only where project showcases and feedback requests are allowed; adapt to the community rules and avoid reposting the same message repeatedly.

## Bun community: tracing example

I put together a small Bun tracing guide using SignalKit’s Bun.serve wrapper. It records method, safe route, status and duration without attaching raw request bodies or arbitrary headers. It also shows why routes-table handlers need individual wrapping and why sensitive slugs need explicit templates.

There is a complete console-observer example and an OTLP HTTP JSON option. The recorded verification is an actual local Bun server plus a local recorder; it is not a deployed SigNoz claim. This is an unpublished workspace prototype.

Would you try the route-template example and tell us if it fits your Bun app’s routing structure?

https://techinjectindia.github.io/signal-kit/guides/bun-api-tracing/?utm_source=bun_community&utm_medium=community&utm_campaign=alpha_guides

## Technical article sharing: Meta event IDs

Browser Pixel and server CAPI copies need the same persisted purchase event ID. A request trace ID is a different identity and should not replace it.

This guide walks through SignalKit’s public Pixel configuration, server-only CAPI token, supported matching fields, and the distinction between local payload checks and actual account-specific deduplication.

https://techinjectindia.github.io/signal-kit/guides/meta-pixel-capi-event-ids/?utm_source=developer_community&utm_medium=community&utm_campaign=alpha_guides

## Pilot outreach: direct ask

Hi [name], do you work on a Next.js ecommerce storefront or Bun API?

We’re testing SignalKit, an open-source prototype for consent-aware commerce events and request telemetry. Would you spend 20 minutes trying its local lab with synthetic data and telling us where setup breaks or becomes confusing? You do not need live provider credentials.

Guide: https://techinjectindia.github.io/signal-kit/docs/?utm_source=pilot_outreach&utm_medium=direct&utm_campaign=alpha_pilots

If it fits, we’d like to follow up on whether you kept using it. A feedback report is enough; there is no star or public endorsement request.

## Follow-up after a willing pilot

Thanks for trying the lab. Which framework/runtime versions did you use, how far did you get, and which step required the most work? Please omit credentials and customer data. If you chose not to continue, the reason is useful too.

May we quote your feedback publicly with your preferred attribution? We’ll keep it private unless you explicitly agree.
