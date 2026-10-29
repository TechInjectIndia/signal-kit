'use client';
import { useEffect, useRef } from 'react';
import { useSignals } from '@techinject/nextjs';
import { mountConnectionsDashboard } from '@techinject/browser/dashboard';

export default function ConnectionsPage() {
  const signals = useSignals();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (container.current)
      return mountConnectionsDashboard(container.current, signals, {
        observability: [
          { backend: 'sentry', configured: false },
          { backend: 'grafana', configured: false },
          { backend: 'signoz', configured: false },
        ],
      });
  }, [signals]);
  return (
    <section>
      <p className="eyebrow">LOCAL CONNECTIONS / SYNTHETIC PROVIDERS</p>
      <h1>
        Your signals,
        <br />
        at a glance.
      </h1>
      <p>
        This lab uses synthetic recorders. Set up your own backend to export observability data.
      </p>
      <div ref={container} />
    </section>
  );
}
