# In-app connections dashboard

The Next.js local lab has a `/connections` page. It uses synthetic local providers. Your production page should sit behind the host application's authentication and reuse its existing SDK instance.

```tsx
// app/connections/page.tsx — under the existing SignalKitProvider
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

Add `@techinject/browser` as a direct host dependency for the dashboard subpath. Alpha packages remain unpublished; use the workspace or prepared local packages. The renderer is separately imported so normal browser entry points do not include UI. Style `.signalkit-connections` and its articles with your host CSS; the Next lab provides a responsive example.

For SvelteKit or plain JavaScript, call `mountConnectionsDashboard(element, signals)` after client mount; call the returned cleanup on page teardown. For SvelteKit obtain the existing instance through `client.getSignals()` after `client.mount()`. Do not create another SDK instance just for the dashboard.

The view shows current consent, configured provider names/categories, last outcome/time and aggregate completed, failed, denied, dropped and invalid counts. It stores no event IDs, payloads or raw errors. No network requests, cookies, storage, polling or test events are introduced. Rendering uses text nodes, including custom provider names.

Configuration does not verify connectivity. `sent` means the adapter's send returned successfully; browser scripts can merely enqueue work. Provider delivery, reporting, attribution and deduplication require independent checks. Consent denial takes precedence over a previous successful outcome. Counts reset when the SDK instance restarts and represent local outcomes, not unique delivered events. Technical `Observer` transports, global framework tracing, provider account health and cross-request/server aggregation are not included.

Core/server consumers can read `signals.getConnections()` and subscribe via `signals.subscribeConnections(listener)`, which returns an unsubscribe function. Snapshots are copied; listeners cannot disrupt dispatch. Request-scoped server instances have request-scoped counts. Any persistent aggregation or authenticated snapshot endpoint belongs to the host, and server credentials/provider objects must never cross into client code.
