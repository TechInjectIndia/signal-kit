# SDK v1 implementation plan

The founder authorized the agreed PRD build on 2026-10-05. Engineering defaults below are implementation decisions, not new live-provider or compatibility promises.

## Package and API contract

All packages use strict TypeScript, ESM, tsc builds to dist, Vitest tests, workspace dependencies. Root pnpm + Turbo handles tasks. Package names @signalkit/contracts, @signalkit/core, @signalkit/browser, @signalkit/server, @signalkit/nextjs, @signalkit/bun. Names are provisional and unpublished.

Contracts exports:

- Consent = { analytics: boolean; marketing: boolean; observability: boolean }, DENIED_CONSENT.
- EventName = 'page_view' | 'product_view' | 'add_to_cart' | 'begin_checkout' | 'purchase'.
- EventInput = { name: EventName; eventId?: string; timestamp?: number; properties: Record<string, unknown> }.
- SignalEvent = { name: EventName; eventId: string; timestamp: number; properties: Record<string, unknown> }.
- RequestRecord = { kind: 'request'; route: string; method: string; status: number; durationMs: number; traceId?: string; spanId?: string; parentSpanId?: string; error?: boolean }.
- Provider = { name: string; category: keyof Consent; send(event: SignalEvent, signal?: AbortSignal): Promise<void> | void; dispose?(): void }.
- Observer = { record(record: RequestRecord): Promise<void> | void; flush?(): Promise<void>; dispose?(): void }.
- DispatchResult = { eventId: string; outcomes: { provider: string; status: 'sent' | 'denied' | 'failed' | 'invalid' | 'dropped'; reason?: string }[] }.

Core exports createSignals({providers?:Provider[], consent?:Consent, timeoutMs?:number, maxPending?:number, onDiagnostic?:(result:DispatchResult)=>void}) -> track(input:EventInput):Promise<DispatchResult>, setConsent(consent), getConsent(), flush():Promise<void>, dispose(). Also safeRoute(url, routeTemplate?) strips query/hash and normalizes numeric/UUID segments, generateId(), traceparent utilities. Validate recognized events, allowlisted fields only, bounded item arrays/strings. No PII/raw error body. Purchase must have transaction_id,currency,value,items; commerce names mappings belong providers. Event ID caller-supplied stable; no memory dedup claiming durability. Consent default denied, drop preconsent, no replay. Bounded concurrency and dispatch timeouts. Consent withdrawal aborts pending delivery as feasible; no retract guarantee.

Browser exports createBrowserSignals({ ...core config, observer?:Observer, traceOrigins?:string[], excludeUrls?:string[], autoTrack?:boolean }) -> core methods plus page(path?:string,eventId?:string), start(), stop(). Start once, tracks initial/history/popstate pages once; fetch/XHR method,status,timing failures to observer with observability consent; preserve host behavior, restore only owned patches, trace header only allowlist, preserve existing trace. All telemetry paths excluded. Browser providers createGA4Provider({measurementId, nonce?}), createMetaPixelProvider({pixelId, nonce?}), createClarityProvider({projectId, nonce?}); scripts lazy after consent, category-specific revocation hooks. Marketing IDs public only. GA4 prevent implicit duplicate page view, Meta uses eventID; bounded queues blocked scripts result failed via timeout.

Server exports createServerSignals({...core config, observer?:Observer, traceOrigins?:string[], excludeUrls?:string[]}) -> core methods plus handle(request,handler,{route?:string}?) and fetch(input,init?) instrument explicit host handler and outbound requests. Respect inbound valid traceparent, generate otherwise; observer consent required. createMetaCapiProvider({pixelId,accessToken,fetch?,endpoint?,testEventCode?, userData?:()=>Record<string,string|string[]>}) verified event mappings; no browser secrets, no raw PII. createOTLPObserver({endpoint,serviceName,headers?,fetch?,maxPending?,timeoutMs?}) standard OTLP HTTP JSON spans; injected OpenTelemetry observer support as possible without owning global providers.

Next package has split exports '.' browser React SignalKitProvider and useSignals; './server' createNextSignals or re-export server handle integration, onRequestError helper, documented Next OTel incoming automatic request integration. Client provider mounts browser lifecycle globally. Bun package exports instrumentBunFetch(signals,handler,routeResolver?) for Bun.serve fetch; route-table handling must be explicit and documented.

## DAG and acceptance

1. Root workspace tooling; contract/core implementation by native coding agent.
2. Browser/Next package and tests by native coding agent; depends on documented contract.
3. Server/Bun package and tests by native coding agent; depends on documented contract.
4. Root examples, architecture/FRD/LLD, cross-package integration and security review.
5. Build/typecheck/tests, real Bun runtime, Next production build and browser navigation verification; local providers recorded separately from live provider claims.

Native agents replace unavailable Claude/OpenCode executors. No credentialed provider calls or publication. Tests must use deterministic injected transports or local recorder, no customer payloads. Each agent owns only its packages; root owns shared tooling/examples/docs.

Final package layout moved into packages/features/signals per feature-architecture. Next server split into @signalkit/nextjs-server to preserve browser dependency graph. OpenCode CLI is present but privacy/tracing implementation tasks required judgment and ran on native coding agents; unavailable named Claude executors substituted inherited native agents. No mechanical executor invocation or cost claim.
