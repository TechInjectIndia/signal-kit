# Observability backends: local and cloud

Use one OTLP implementation for SigNoz and Grafana-compatible trace backends, whether local or hosted. Configure the destination URL and authentication headers. Sentry has a separate error-reporting bridge. The Sentry/composition helpers are unreleased source additions; live provider ingestion is not verified.

## Shared OTLP configuration

```ts
import {
  createServerSignals,
  createOTLPObserver,
  createSentryObserver,
  combineObservers,
} from '@techinject/server';

const traces = createOTLPObserver({
  endpoint: serverConfig.traceEndpoint,
  headers: serverConfig.traceHeaders,
  serviceName: 'shop-api',
  timeoutMs: 1000,
});
const errors = createSentryObserver({ client: hostSentryClient, timeoutMs: 1000 });
const signals = createServerSignals({
  consent: hostObservabilityPolicy,
  observer: combineObservers([errors, traces], { timeoutMs: 1500 }),
});

export async function handle(request: Request) {
  try {
    return await signals.handle(request, applicationHandler, { route: '/orders/:id' });
  } finally {
    await signals.flush();
  }
}
```

`serverConfig`, `hostSentryClient`, `hostObservabilityPolicy` and `applicationHandler` are host-supplied inputs. Install and initialize the appropriate official Sentry SDK in the host. SignalKit does not initialize a global Sentry client or tracer.

| Destination               | Full trace endpoint                                                                | Authentication headers                 |
| ------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| Self-hosted SigNoz        | Collector address, for example `http://localhost:4318/v1/traces`                   | As configured on the collector/gateway |
| SigNoz Cloud              | Regional ingestion URL plus `/v1/traces`                                           | `signoz-ingestion-key: <key>`          |
| Self-hosted Grafana stack | Tempo or an OTLP collector receiver, for example `http://localhost:4318/v1/traces` | As configured on the collector/gateway |
| Grafana Cloud             | Portal-provided OTLP URL plus `/v1/traces`, preserving `/otlp` when present        | Portal-provided `Authorization` header |

Supply the complete trace URL: `createOTLPObserver` uses it exactly and does not append paths. Use the ingestion endpoint, not a Grafana dashboard URL. Local Tempo must have an OTLP HTTP receiver configured. Cloud accounts and local gateways can require different authentication; the serialization/export implementation stays the same.

For Grafana Cloud, server code can construct Basic authentication from the provided instance ID and API token:

```ts
const traceHeaders = {
  Authorization: `Basic ${Buffer.from(`${instanceId}:${apiToken}`).toString('base64')}`,
};
```

For SigNoz Cloud:

```ts
const traceHeaders = { 'signoz-ingestion-key': ingestionKey };
```

Keep all headers and tokens server-only, and use HTTPS for remote credential-bearing endpoints. Local HTTP collectors remain supported. No separate cloud factories, subscription, region or account selection is needed in SignalKit.

The existing standalone OTLP observer retains its prior lifecycle behavior; when used directly, call `setConsent` with the host policy before recording. `createServerSignals` and the new composite start with denied consent unless the host grants observability. Sentry starts denied. For request-specific consent, create isolated signals/observer instances per invocation and dispose them after flushing; never mutate shared consent based on an individual user. SvelteKit hooks already support a per-request configuration factory.

## Error capture and privacy

The Sentry observer emits a fixed request-failure summary for status 0 or 5xx. Successful responses and ordinary 4xx responses do not create issues. To report a caught exception explicitly:

```ts
try {
  await runBackgroundOperation();
} catch (error) {
  errors.captureException(error, { route: '/jobs/reconcile', method: 'POST' });
  await errors.flush();
  throw error;
}
```

The Sentry observer must have observability consent enabled, normally through `createServerSignals`/`combineObservers`. Standalone Sentry use requires `setConsent` explicitly. Exception reporting classifies standard built-in error types, excludes the original message, stack, cause and arbitrary metadata, and groups by type/route. This intentionally limits line-level debugging. SignalKit trace/span IDs appear as correlation tags, not a replacement for Sentry's own active trace.

A host-owned Sentry client may attach its own scope, breadcrumbs, integrations or event-processor data. Configure its privacy controls separately; SignalKit does not sanitize or disable native Sentry capture. Avoid duplicate reports when the host's native integration already handles the same exception. Withdrawal stops future SignalKit submissions; events already handed to Sentry cannot be retracted by this adapter. Disposal does not close the shared host client.

## Serverless lifecycle

- Firebase Functions: complete telemetry work before ending the invocation. HTTP responses must not be sent before awaited work that depends on the invocation remaining alive. The Fetch handler above is illustrative, not a Firebase HTTP adapter.
- Vercel Node: use an appropriate platform lifecycle hook such as `waitUntil` for pending exports, or await a bounded flush before returning. Platform deadlines still apply.
- SvelteKit Node: use a fresh observer set in the existing configuration factory; the adapter flushes and disposes per request.
- Next.js: Sentry/composition helpers and the existing OTLP exporter are also exported by `@techinject/nextjs-server`. The observers consume SignalKit request records; merely creating one does not redirect framework-native OTel spans. Configure the existing host OTel exporter separately and avoid registering a second global tracer.

These adapters do not add a Firebase wrapper, certify Edge support, collect arbitrary stdout/console logs, upload source maps, instrument every database call or guarantee delivery after a hard crash. The OTLP exporter emits request traces, not metrics or an OTLP logs pipeline. Observer composition isolates failures and bounds waits; it does not make custom child transports cancellable.

## Verification boundary

Unit tests use synthetic transports and a mock Sentry client. They validate exact endpoint/header forwarding, privacy, consent, failure isolation and bounded flush behavior. Live account ingestion, actual Sentry SDK compatibility in each host, provider dashboards and deployed Vercel/Firebase lifecycles must be verified before a production-support claim. Configure sampling and usage limits in the host/backend before enabling high-volume telemetry.

## Provider references

- [Grafana Cloud OTLP setup](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/)
- [SigNoz Cloud ingestion](https://signoz.io/docs/ingestion/signoz-cloud/overview/)
- [Sentry JavaScript SDK APIs](https://docs.sentry.io/platforms/javascript/apis/)
- [Firebase invocation lifecycle](https://firebase.google.com/docs/functions/tips)
- [Vercel Functions lifecycle APIs](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)

## Local connections page

The Next.js and SvelteKit `/connections` labs now list Sentry, Grafana and SigNoz under Observability, marked not configured. To show your own safe configuration summary, use the optional [dashboard observability entries](CONNECTIONS-DASHBOARD.md#observability-entries-unreleased). Listing a backend does not enable it or verify a live connection.
