import type { ConnectionStatus } from '@techinject/core';

export type ConnectionSource = {
  getConnections(): ConnectionStatus[];
  subscribeConnections(listener: () => void): () => void;
};

/** Mount in an authenticated host page. No network requests, payloads, or credentials. */
export function mountConnectionsDashboard(element: HTMLElement, source: ConnectionSource) {
  const document = element.ownerDocument;
  const root = document.createElement('section');
  root.className = 'signalkit-connections';
  root.setAttribute('aria-label', 'SignalKit connections');
  const heading = document.createElement('h2');
  heading.textContent = 'Connections';
  const note = document.createElement('p');
  note.textContent =
    'This SDK instance only. SDK send completion does not prove provider delivery or attribution. Counts reset when the instance restarts. Technical observers are not included.';
  const list = document.createElement('div');
  root.append(heading, note, list);
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
