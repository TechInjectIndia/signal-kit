import type { ConnectionStatus } from '@techinject/core';

export type ConnectionSource = {
  getConnections(): ConnectionStatus[];
  subscribeConnections(listener: () => void): () => void;
};

export type ObservabilityConnection = {
  backend: 'sentry' | 'grafana' | 'signoz' | 'otlp';
  configured: boolean;
  hosting?: 'local' | 'cloud';
  enabled?: boolean;
};
export type ConnectionsDashboardOptions = {
  /** Static host-declared metadata only; never pass endpoints, headers or SDK clients. */
  observability?: readonly ObservabilityConnection[];
};
const observabilityCatalog = {
  sentry: {
    label: 'Sentry',
    setup:
      'Connect a host-owned Sentry client for request failures and sanitized exception summaries.',
  },
  grafana: {
    label: 'Grafana',
    setup:
      'Set the full OTLP traces endpoint and authentication headers on the server. Local Tempo and Grafana Cloud use the same exporter.',
  },
  signoz: {
    label: 'SigNoz',
    setup:
      'Set the full OTLP traces endpoint and any required authentication headers on the server. Local and cloud deployments use the same exporter.',
  },
  otlp: {
    label: 'OpenTelemetry',
    setup:
      'Set the full OTLP traces endpoint and any required authentication headers on the server.',
  },
};

/** Mount in an authenticated host page. No network requests, payloads, or credentials. */
export function mountConnectionsDashboard(
  element: HTMLElement,
  source: ConnectionSource,
  options: ConnectionsDashboardOptions = {},
) {
  const document = element.ownerDocument;
  const root = document.createElement('section');
  root.className = 'signalkit-connections';
  root.setAttribute('aria-label', 'SignalKit connections');
  const heading = document.createElement('h2');
  heading.textContent = 'Connections';
  const note = document.createElement('p');
  note.textContent =
    'This SDK instance only. SDK send completion does not prove provider delivery or attribution. Counts reset when the instance restarts. Observability configuration is shown separately when supplied by the host.';
  const list = document.createElement('section');
  list.setAttribute('aria-label', 'Event provider connections');
  root.append(heading, note, list);
  if (options.observability) {
    const section = document.createElement('section');
    section.setAttribute('aria-label', 'Observability connections');
    const title = document.createElement('h2');
    title.textContent = 'Observability';
    const explanation = document.createElement('p');
    explanation.textContent =
      'Host-declared configuration only. No connection checks or delivery verification are performed. Server consent and policy remain host-owned.';
    section.append(title, explanation);
    const seen = new Set<string>();
    for (const connection of options.observability.slice(0, 4)) {
      if (
        !connection ||
        !Object.hasOwn(observabilityCatalog, connection.backend) ||
        seen.has(connection.backend)
      )
        continue;
      seen.add(connection.backend);
      const backend = observabilityCatalog[connection.backend];
      const card = document.createElement('article');
      const name = document.createElement('h3');
      name.textContent = backend.label;
      const status = document.createElement('p');
      status.textContent =
        connection.configured !== true
          ? 'Not configured'
          : connection.enabled === false
            ? 'Configured · blocked by host policy · delivery unverified'
            : 'Configured · delivery unverified';
      const hosting = document.createElement('p');
      hosting.textContent =
        connection.hosting === 'local'
          ? 'Local deployment'
          : connection.hosting === 'cloud'
            ? 'Cloud deployment'
            : 'Hosting selected by the host';
      const setup = document.createElement('p');
      setup.textContent = backend.setup;
      card.append(name, status, hosting, setup);
      section.append(card);
    }
    root.append(section);
  }
  element.append(root);
  const render = () => {
    list.replaceChildren();
    const connections = source.getConnections();
    if (!connections.length) {
      const empty = document.createElement('p');
      empty.textContent =
        'No event providers configured. Add providers to your SignalKit configuration.';
      list.append(empty);
    }
    for (const connection of connections) {
      const card = document.createElement('article');
      const name = document.createElement('h3');
      name.textContent = connection.name;
      const status = document.createElement('p');
      const labels = {
        sent: 'SDK send completed',
        denied: 'Consent denied',
        failed: 'Send failed',
        dropped: 'Dropped (timeout, capacity or disposed)',
        invalid: 'Invalid event',
      };
      status.textContent = connection.disposed
        ? 'SDK disposed'
        : !connection.consent
          ? 'Blocked by consent'
          : connection.lastStatus
            ? labels[connection.lastStatus]
            : 'Configured · no outcomes yet';
      const detail = document.createElement('p');
      detail.textContent = `${connection.category} · ${connection.attempts} outcomes · ${connection.sent} completed · ${connection.failed} failed · ${connection.denied} denied · ${connection.dropped} dropped · ${connection.invalid} invalid`;
      const time = document.createElement('p');
      time.textContent = connection.lastUpdated
        ? `Last outcome: ${new Date(connection.lastUpdated).toLocaleString()}`
        : 'Waiting for a new event.';
      card.append(name, status, detail, time);
      list.append(card);
    }
  };
  render();
  const unsubscribe = source.subscribeConnections(render);
  return () => {
    unsubscribe();
    root.remove();
  };
}
