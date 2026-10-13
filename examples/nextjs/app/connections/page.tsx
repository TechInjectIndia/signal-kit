'use client';
import { useEffect, useRef } from 'react';
import { useSignals } from '@techinject/nextjs';
import { mountConnectionsDashboard } from '@techinject/browser/dashboard';

export default function ConnectionsPage() {
  const signals = useSignals();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (container.current) return mountConnectionsDashboard(container.current, signals);
  }, [signals]);
  return (
    <section>
      <p className="eyebrow">LOCAL CONNECTIONS / SYNTHETIC PROVIDERS</p>
      <h1>
        Your signals,
        <br />
        at a glance.
      </h1>
      <div ref={container} />
    </section>
  );
}
