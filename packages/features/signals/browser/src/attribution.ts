import { parseAttribution, type AttributionTouch, type Consent } from '@techinject/core';
export type AttributionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type AttributionOptions = {
  /** Consent category that permits persisting the visit source. Defaults to marketing. */
  category?: 'analytics' | 'marketing';
  /** Defaults to window.localStorage; inject for tests or cookie-backed stores. */
  storage?: AttributionStorage;
  /** First-touch retention; defaults to 90 days, clamped to 1–365. */
  maxAgeDays?: number;
  key?: string;
};
export type Attribution = { first?: AttributionTouch; last?: AttributionTouch };
const DAY = 86_400_000;
function isTouch(value: unknown): value is AttributionTouch {
  const touch = value as AttributionTouch;
  return (
    !!touch &&
    typeof touch === 'object' &&
    typeof touch.channel === 'string' &&
    typeof touch.source === 'string' &&
    typeof touch.medium === 'string' &&
    typeof touch.landingPath === 'string' &&
    Number.isFinite(touch.timestamp)
  );
}
/**
 * First/last-touch visit source kept in first-party storage once the host's consent allows it.
 * Captured in memory on landing; persisted, merged and expired only under consent.
 */
export function createAttributionStore(options: AttributionOptions = {}) {
  const category = options.category ?? 'marketing';
  const key = options.key ?? 'signalkit.attribution';
  const maxAge = Math.max(1, Math.min(365, options.maxAgeDays ?? 90)) * DAY;
  const storage = () => {
    try {
      return options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
    } catch {
      return undefined;
    }
  };
  let allowed = false;
  let landing: AttributionTouch | undefined;
  function read(): Attribution {
    try {
      const raw = storage()?.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Attribution;
      const now = Date.now();
      const fresh = (touch?: AttributionTouch) =>
        isTouch(touch) && now - touch.timestamp <= maxAge ? touch : undefined;
      const first = fresh(parsed.first);
      const last = fresh(parsed.last);
      return { ...(first ? { first } : {}), ...(last ? { last } : {}) };
    } catch {
      return {};
    }
  }
  function write(value: Attribution) {
    try {
      if (value.first || value.last) storage()?.setItem(key, JSON.stringify(value));
      else storage()?.removeItem(key);
    } catch {
      /* Storage denial must not affect the host. */
    }
  }
  function persist() {
    if (!allowed || !landing || landing.channel === 'direct') return;
    const stored = read();
    write({ first: stored.first ?? landing, last: landing });
  }
  return {
    capture(url: string, referrer: string | null | undefined) {
      landing = parseAttribution({ url, referrer });
      persist();
    },
    setConsent(consent: Consent) {
      allowed = consent[category] === true;
      if (allowed) persist();
      else write({});
    },
    get(): Attribution {
      const stored = allowed ? read() : {};
      const current = landing && landing.channel !== 'direct' ? landing : undefined;
      const first = stored.first ?? current;
      const last = current ?? stored.last;
      return { ...(first ? { first } : {}), ...(last ? { last } : {}) };
    },
    clear() {
      landing = undefined;
      write({});
    },
  };
}
