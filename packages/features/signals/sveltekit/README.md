# @techinject/sveltekit

Unpublished alpha browser lifecycle adapter. Construct createSvelteKitClient(config) per root layout, mount it inside Svelte onMount, and return client.dispose from that callback. Construction is SSR-safe; mounting on the server throws. mount is idempotent; dispose restores owned patches and allows a fresh mount.

getSignals() exposes the browser SDK after mounting: setConsent, track, page and flush. Initial/pathname pages and browser fetch/XHR use the existing browser instrumentation. Do not also call page from afterNavigate for every navigation: that would duplicate automatic pages. Query-only navigation is not a new page. Denied pages are dropped; explicitly call page after a real consent decision if the current page should be recorded.

Keep this client per layout, never in a shared server module. Use host-owned persisted consent. Inject a browser observer for technical requests; GA4/Meta receive business events, not API telemetry. No server credentials belong in client configuration. Use @techinject/sveltekit-server only in hooks.server.ts on Node.

See [integration reference](../INTEGRATION.md), [runtime evidence](../../../../docs/COMPATIBILITY.md) and [SvelteKit lab](../../../../examples/sveltekit/README.md). Verified SvelteKit 3/Svelte 5; other majors and Edge runtimes are not certified.
