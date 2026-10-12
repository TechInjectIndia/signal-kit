# @techinject/sveltekit-server

Unpublished alpha Node adapter for SvelteKit 3. createSvelteKitHooks(getConfig) returns handle and handleFetch for hooks.server.ts. Supply a config factory using the actual request's host policy/consent. Return fresh observers/providers per request: the adapter flushes bounded work and disposes them when resolve completes. Do not return a shared disposable collector or mutate global consent.

handle uses event.route.id for route templates, preserves resolve responses/errors, and isolates request context with AsyncLocalStorage. handleFetch wraps SvelteKit's supplied fetch instead of substituting global fetch, retaining its cookie/internal-route semantics and correlating outgoing records. When invoked outside an active handle scope, it passes through. Compose authentication first using SvelteKit sequence; compose any other handleFetch hook inside the supplied transport.

Node only. Prerender/static assets and platform requests outside SvelteKit's handle pipeline are not incoming API coverage. Supply a denied policy during prerender/build if appropriate. Unknown routes use existing safeRoute heuristics; avoid sensitive slugs and use exclusions. Flush adds bounded telemetry wait to the response; set timeoutMs and maxPending for your host budget. Streaming/background work after resolve is outside this request's lifecycle. No durable retry or automatic purchase verification.

See [integration reference](../INTEGRATION.md) and [SvelteKit lab](../../../../examples/sveltekit/README.md). Peer framework: SvelteKit >=3 <4. Browser package remains separate; no server import belongs in a client component.

A throwing/rejected config factory disables telemetry for that resolve scope and passes through to the host. Authenticate/authorize in a separate earlier hook; never use the telemetry config callback as an access-control gate.
