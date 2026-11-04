/**
 * Server-only query-performance clients for Google Search Console and Bing
 * Webmaster Tools. Credentials are host-owned and injected; nothing here reads
 * the environment, and no error ever carries a token, API key, URL with a
 * credential, or a raw provider response.
 */
export type SearchEngine = 'google' | 'bing';
export type SearchDimension = 'query' | 'page' | 'country' | 'device' | 'date';
export type SearchQueryRow = {
  engine: SearchEngine;
  query?: string;
  page?: string;
  country?: string;
  device?: string;
  date?: string; // YYYY-MM-DD
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number;
};
export type SearchQueryRequest = {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  dimensions?: SearchDimension[]; // default ['query']
  rowLimit?: number; // clamp 1..5000, default 1000
  page?: string; // optional exact page URL filter
};
export type SearchConsoleClient = {
  engine: SearchEngine;
  queries(request: SearchQueryRequest, signal?: AbortSignal): Promise<SearchQueryRow[]>;
};
export type GoogleSearchConsoleOptions = {
  /** 'sc-domain:example.com' or 'https://example.com/' exactly as verified in Search Console. */
  siteUrl: string;
  /** Host-owned OAuth access token with scope https://www.googleapis.com/auth/webmasters.readonly. */
  accessToken: () => Promise<string> | string;
  fetch?: typeof globalThis.fetch;
  endpoint?: string; // default 'https://searchconsole.googleapis.com/webmasters/v3'
  timeoutMs?: number; // default 10000, clamp 1..60000
};
export type BingWebmasterOptions = {
  siteUrl: string; // e.g. 'https://example.com/'
  apiKey: string; // Bing Webmaster Tools API key, server-only
  fetch?: typeof globalThis.fetch;
  endpoint?: string; // default 'https://ssl.bing.com/webmaster/api.svc/json'
  timeoutMs?: number;
};

const GOOGLE_ENDPOINT = 'https://searchconsole.googleapis.com/webmasters/v3';
const BING_ENDPOINT = 'https://ssl.bing.com/webmaster/api.svc/json';
const DIMENSIONS: readonly SearchDimension[] = ['query', 'page', 'country', 'device', 'date'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 2048;

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
const number = (value: unknown): number => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};
const clamp = (value: number | undefined, min: number, max: number, fallback: number): number =>
  value !== undefined && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value)))
    : fallback;
const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};
const trimEndpoint = (value: string | undefined, fallback: string): string => {
  const endpoint = text(value) || fallback;
  if (!isHttpUrl(endpoint)) throw new Error('Invalid search console endpoint');
  return endpoint.replace(/\/+$/, '');
};

type NormalizedRequest = {
  startDate: string;
  endDate: string;
  dimensions: SearchDimension[];
  rowLimit: number;
  page?: string;
};
function normalizeRequest(request: SearchQueryRequest): NormalizedRequest {
  const startDate = text(request.startDate);
  const endDate = text(request.endDate);
  if (!DATE.test(startDate) || !DATE.test(endDate) || startDate > endDate)
    throw new Error('Invalid search console date range');
  const dimensions = Array.from(
    new Set((request.dimensions ?? ['query']).filter((d) => DIMENSIONS.includes(d))),
  );
  const page = text(request.page);
  return {
    startDate,
    endDate,
    dimensions: dimensions.length ? dimensions : ['query'],
    rowLimit: clamp(request.rowLimit, 1, 5000, 1000),
    ...(page ? { page } : {}),
  };
}

/** Combine a caller signal with a timeout; the caller gets a cleanup to run after settlement. */
function deadline(timeoutMs: number, signal?: AbortSignal): { signal: AbortSignal; done(): void } {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return { signal: timeout, done: () => {} };
  if (typeof AbortSignal.any === 'function')
    return { signal: AbortSignal.any([signal, timeout]), done: () => {} };
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted || timeout.aborted) controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      signal.removeEventListener('abort', abort);
      timeout.removeEventListener('abort', abort);
    },
  };
}

async function exchange(
  transport: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) throw new Error('Search console request aborted');
  const gate = deadline(timeoutMs, signal);
  let response: Response;
  try {
    response = await transport(url, { ...init, signal: gate.signal });
  } catch {
    throw new Error(
      signal?.aborted ? 'Search console request aborted' : 'Search console request failed',
    );
  } finally {
    gate.done();
  }
  if (!response.ok) throw new Error('Search console request rejected');
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error('Search console response invalid');
  }
}

export function createGoogleSearchConsoleClient(
  options: GoogleSearchConsoleOptions,
): SearchConsoleClient {
  const siteUrl = text(options.siteUrl);
  if (!siteUrl || !(siteUrl.startsWith('sc-domain:') || isHttpUrl(siteUrl)))
    throw new Error('Invalid search console site');
  if (typeof options.accessToken !== 'function')
    throw new Error('Search console credential unavailable');
  const endpoint = trimEndpoint(options.endpoint, GOOGLE_ENDPOINT);
  const transport = options.fetch ?? globalThis.fetch;
  const timeoutMs = clamp(options.timeoutMs, 1, 60_000, 10_000);
  const url = `${endpoint}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  return {
    engine: 'google',
    async queries(request, signal) {
      const query = normalizeRequest(request);
      let token = '';
      try {
        token = text(await options.accessToken());
      } catch {
        token = '';
      }
      if (!token) throw new Error('Search console credential unavailable');
      const payload = await exchange(
        transport,
        url,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            startDate: query.startDate,
            endDate: query.endDate,
            dimensions: query.dimensions,
            rowLimit: query.rowLimit,
            dimensionFilterGroups: query.page
              ? [{ filters: [{ dimension: 'page', operator: 'equals', expression: query.page }] }]
              : [],
          }),
        },
        timeoutMs,
        signal,
      );
      const rows = (payload as { rows?: unknown })?.rows;
      if (!Array.isArray(rows)) return [];
      return rows.flatMap((raw): SearchQueryRow[] => {
        if (!raw || typeof raw !== 'object') return [];
        const entry = raw as Record<string, unknown>;
        const keys = Array.isArray(entry.keys) ? entry.keys : [];
        const row: SearchQueryRow = {
          engine: 'google',
          clicks: number(entry.clicks),
          impressions: number(entry.impressions),
          ctr: number(entry.ctr),
          position: number(entry.position),
        };
        query.dimensions.forEach((dimension, index) => {
          const value = text(keys[index]);
          if (value) row[dimension] = value;
        });
        return [row];
      });
    },
  };
}

const parseBingDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value.trim());
  const ms = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(ms)) return DATE.test(value.trim()) ? value.trim() : undefined;
  return new Date(ms).toISOString().slice(0, 10);
};

export function createBingWebmasterClient(options: BingWebmasterOptions): SearchConsoleClient {
  const siteUrl = text(options.siteUrl);
  if (!siteUrl || !isHttpUrl(siteUrl)) throw new Error('Invalid search console site');
  const apiKey = text(options.apiKey);
  if (!apiKey) throw new Error('Search console credential unavailable');
  const endpoint = trimEndpoint(options.endpoint, BING_ENDPOINT);
  const transport = options.fetch ?? globalThis.fetch;
  const timeoutMs = clamp(options.timeoutMs, 1, 60_000, 10_000);
  return {
    engine: 'bing',
    async queries(request, signal) {
      const query = normalizeRequest(request);
      const byPage = query.page !== undefined && query.dimensions.includes('page');
      const url = byPage
        ? `${endpoint}/GetPageQueryStats?siteUrl=${encodeURIComponent(siteUrl)}&page=${encodeURIComponent(query.page!)}&apikey=${encodeURIComponent(apiKey)}`
        : `${endpoint}/GetQueryStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${encodeURIComponent(apiKey)}`;
      const payload = await exchange(transport, url, { method: 'GET' }, timeoutMs, signal);
      const items = (payload as { d?: unknown })?.d;
      if (!Array.isArray(items)) return [];
      const withDate = query.dimensions.includes('date');
      const buckets = new Map<
        string,
        { query: string; date?: string; clicks: number; impressions: number; weighted: number }
      >();
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = raw as Record<string, unknown>;
        const date = parseBingDate(entry.Date);
        if (date && (date < query.startDate || date > query.endDate)) continue;
        const term = text(entry.Query);
        const key = withDate ? `${date ?? ''}\u0000${term}` : term;
        const impressions = number(entry.Impressions);
        const bucket = buckets.get(key) ?? {
          query: term,
          ...(withDate && date ? { date } : {}),
          clicks: 0,
          impressions: 0,
          weighted: 0,
        };
        bucket.clicks += number(entry.Clicks);
        bucket.impressions += impressions;
        bucket.weighted += impressions * number(entry.AvgImpressionPosition);
        buckets.set(key, bucket);
      }
      return Array.from(buckets.values())
        .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
        .slice(0, query.rowLimit)
        .map((bucket) => ({
          engine: 'bing' as const,
          ...(bucket.query ? { query: bucket.query } : {}),
          ...(byPage ? { page: query.page } : {}),
          ...(bucket.date ? { date: bucket.date } : {}),
          clicks: bucket.clicks,
          impressions: bucket.impressions,
          ctr: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0,
          position: bucket.impressions > 0 ? bucket.weighted / bucket.impressions : 0,
        }));
    },
  };
}

/** Merge rows from several engines and sort by clicks desc then impressions desc. */
export function mergeSearchRows(rows: SearchQueryRow[][]): SearchQueryRow[] {
  return rows
    .flat()
    .slice()
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}
