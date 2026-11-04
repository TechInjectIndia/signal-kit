import { describe, expect, it, vi } from 'vitest';
import {
  createBingWebmasterClient,
  createGoogleSearchConsoleClient,
  mergeSearchRows,
  type SearchQueryRow,
} from '../src/search-console.js';

const TOKEN = 'ya29.secret-google-token';
const API_KEY = 'bing-secret-key-123';
const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
const bingDate = (iso: string) =>
  `/Date(${Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))})/`;

describe('google search console client', () => {
  it('posts the analytics query with bearer auth and maps rows in dimension order', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      json({
        rows: [
          {
            keys: ['signalkit', '2026-01-02'],
            clicks: '12',
            impressions: 100,
            ctr: 0.12,
            position: 3.4,
          },
          { keys: ['  spaced  '], clicks: 'nan', impressions: Infinity, ctr: 0, position: 1 },
          'garbage',
        ],
      }),
    );
    const client = createGoogleSearchConsoleClient({
      siteUrl: 'sc-domain:example.com',
      accessToken: async () => TOKEN,
      fetch,
    });
    expect(client.engine).toBe('google');
    const rows = await client.queries({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      dimensions: ['query', 'date'],
      rowLimit: 25,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      'https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      dimensions: ['query', 'date'],
      rowLimit: 25,
      dimensionFilterGroups: [],
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(rows).toEqual([
      {
        engine: 'google',
        query: 'signalkit',
        date: '2026-01-02',
        clicks: 12,
        impressions: 100,
        ctr: 0.12,
        position: 3.4,
      },
      { engine: 'google', query: 'spaced', clicks: 0, impressions: 0, ctr: 0, position: 1 },
    ]);
  });
  it('adds an equals page filter group and uses a custom endpoint and default dimensions', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ rows: [] }));
    const client = createGoogleSearchConsoleClient({
      siteUrl: 'https://example.com/',
      accessToken: () => TOKEN,
      fetch,
      endpoint: 'https://gsc.test/v3/',
      timeoutMs: 999_999,
    });
    await client.queries({
      startDate: '2026-02-01',
      endDate: '2026-02-01',
      page: 'https://example.com/pricing',
      rowLimit: 99_999,
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      'https://gsc.test/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query',
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      startDate: '2026-02-01',
      endDate: '2026-02-01',
      dimensions: ['query'],
      rowLimit: 5000,
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: 'page', operator: 'equals', expression: 'https://example.com/pricing' },
          ],
        },
      ],
    });
  });
  it('rejects invalid date ranges before touching the network', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createGoogleSearchConsoleClient({
      siteUrl: 'sc-domain:example.com',
      accessToken: () => TOKEN,
      fetch,
    });
    for (const [startDate, endDate] of [
      ['2026-1-1', '2026-01-31'],
      ['2026-01-31', '2026-01-01'],
      ['', '2026-01-01'],
      ['2026-01-01', 'tomorrow'],
    ] as const)
      await expect(client.queries({ startDate, endDate })).rejects.toThrow(
        'Invalid search console date range',
      );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('validates the site URL at construction', () => {
    for (const siteUrl of ['', '   ', 'example.com', 'ftp://example.com', 'domain:example.com'])
      expect(() => createGoogleSearchConsoleClient({ siteUrl, accessToken: () => TOKEN })).toThrow(
        'Invalid search console site',
      );
  });
  it('never leaks the token or the response body when the provider rejects', async () => {
    const body = '{"error":{"message":"Request had invalid authentication credentials ya29.leak"}}';
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(body, { status: 401 }));
    const client = createGoogleSearchConsoleClient({
      siteUrl: 'sc-domain:example.com',
      accessToken: () => TOKEN,
      fetch,
    });
    const failure = await client.queries({ startDate: '2026-01-01', endDate: '2026-01-02' }).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toBe('Search console request rejected');
    expect(failure!.message).not.toContain(TOKEN);
    expect(failure!.message).not.toContain('invalid authentication');
    expect(failure!.message).not.toContain('401');
    expect(String(failure)).not.toContain('ya29');
  });
  it('reports a credential failure when the token getter throws or returns nothing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const request = { startDate: '2026-01-01', endDate: '2026-01-02' };
    const throwing = createGoogleSearchConsoleClient({
      siteUrl: 'sc-domain:example.com',
      accessToken: async () => {
        throw new Error(`refresh failed for ${TOKEN}`);
      },
      fetch,
    });
    await expect(throwing.queries(request)).rejects.toThrow(
      'Search console credential unavailable',
    );
    const empty = createGoogleSearchConsoleClient({
      siteUrl: 'sc-domain:example.com',
      accessToken: () => '   ',
      fetch,
    });
    await expect(empty.queries(request)).rejects.toThrow('Search console credential unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('treats a malformed JSON body as an invalid response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('<html>oops', { status: 200 }),
    );
    const client = createGoogleSearchConsoleClient({
      siteUrl: 'sc-domain:example.com',
      accessToken: () => TOKEN,
      fetch,
    });
    await expect(
      client.queries({ startDate: '2026-01-01', endDate: '2026-01-02' }),
    ).rejects.toThrow('Search console response invalid');
  });
  it('rejects when the caller aborts the request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted by transport')));
        }),
    );
    const client = createGoogleSearchConsoleClient({
      siteUrl: 'sc-domain:example.com',
      accessToken: () => TOKEN,
      fetch,
    });
    const controller = new AbortController();
    const pending = client.queries(
      { startDate: '2026-01-01', endDate: '2026-01-02' },
      controller.signal,
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(pending).rejects.toThrow('Search console request aborted');
    const already = new AbortController();
    already.abort();
    await expect(
      client.queries({ startDate: '2026-01-01', endDate: '2026-01-02' }, already.signal),
    ).rejects.toThrow('Search console request aborted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects when the timeout elapses', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('timeout')));
        }),
    );
    const client = createGoogleSearchConsoleClient({
      siteUrl: 'sc-domain:example.com',
      accessToken: () => TOKEN,
      fetch,
      timeoutMs: 5,
    });
    await expect(
      client.queries({ startDate: '2026-01-01', endDate: '2026-01-02' }),
    ).rejects.toThrow('Search console request failed');
  });
});

describe('bing webmaster client', () => {
  const stats = [
    {
      Query: 'signalkit',
      Clicks: 10,
      Impressions: 100,
      AvgClickPosition: 2,
      AvgImpressionPosition: 4,
      Date: bingDate('2026-03-01'),
    },
    {
      Query: 'signalkit',
      Clicks: 5,
      Impressions: 300,
      AvgClickPosition: 3,
      AvgImpressionPosition: 8,
      Date: bingDate('2026-03-02'),
    },
    {
      Query: 'signalkit',
      Clicks: 999,
      Impressions: 999,
      AvgClickPosition: 1,
      AvgImpressionPosition: 1,
      Date: bingDate('2026-02-28'),
    },
    {
      Query: 'telemetry sdk',
      Clicks: 0,
      Impressions: 0,
      AvgClickPosition: 0,
      AvgImpressionPosition: 0,
      Date: bingDate('2026-03-03'),
    },
    {
      Query: 'consent sdk',
      Clicks: 7,
      Impressions: 70,
      AvgClickPosition: 1,
      AvgImpressionPosition: 2,
      Date: bingDate('2026-03-04'),
    },
    {
      Query: 'outside',
      Clicks: 50,
      Impressions: 50,
      AvgClickPosition: 1,
      AvgImpressionPosition: 1,
      Date: bingDate('2026-04-01'),
    },
  ];
  it('requests query stats with the encoded site and key, then filters and aggregates', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ d: stats }));
    const client = createBingWebmasterClient({
      siteUrl: 'https://example.com/',
      apiKey: API_KEY,
      fetch,
    });
    expect(client.engine).toBe('bing');
    const rows = await client.queries({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      dimensions: ['query', 'country', 'device'],
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      `https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats?siteUrl=${encodeURIComponent('https://example.com/')}&apikey=${encodeURIComponent(API_KEY)}`,
    );
    expect(init?.method).toBe('GET');
    expect(rows).toEqual([
      {
        engine: 'bing',
        query: 'signalkit',
        clicks: 15,
        impressions: 400,
        ctr: 15 / 400,
        position: (100 * 4 + 300 * 8) / 400,
      },
      { engine: 'bing', query: 'consent sdk', clicks: 7, impressions: 70, ctr: 0.1, position: 2 },
      { engine: 'bing', query: 'telemetry sdk', clicks: 0, impressions: 0, ctr: 0, position: 0 },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/country|device|outside/);
  });
  it('keeps dates separate when the date dimension is requested', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ d: stats }));
    const client = createBingWebmasterClient({
      siteUrl: 'https://example.com/',
      apiKey: API_KEY,
      fetch,
    });
    const rows = await client.queries({
      startDate: '2026-03-01',
      endDate: '2026-03-02',
      dimensions: ['query', 'date'],
    });
    expect(rows).toEqual([
      {
        engine: 'bing',
        query: 'signalkit',
        date: '2026-03-01',
        clicks: 10,
        impressions: 100,
        ctr: 0.1,
        position: 4,
      },
      {
        engine: 'bing',
        query: 'signalkit',
        date: '2026-03-02',
        clicks: 5,
        impressions: 300,
        ctr: 5 / 300,
        position: 8,
      },
    ]);
  });
  it('uses the page endpoint when a page filter and page dimension are given', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ d: [stats[0]] }));
    const client = createBingWebmasterClient({
      siteUrl: 'https://example.com/',
      apiKey: API_KEY,
      fetch,
      endpoint: 'https://bing.test/api/',
    });
    const rows = await client.queries({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      dimensions: ['query', 'page'],
      page: 'https://example.com/pricing?x=1',
    });
    expect(fetch.mock.calls[0]![0]).toBe(
      `https://bing.test/api/GetPageQueryStats?siteUrl=${encodeURIComponent('https://example.com/')}&page=${encodeURIComponent('https://example.com/pricing?x=1')}&apikey=${encodeURIComponent(API_KEY)}`,
    );
    expect(rows[0]).toMatchObject({ query: 'signalkit', page: 'https://example.com/pricing?x=1' });
  });
  it('clamps rowLimit and applies it after sorting by clicks', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({ d: stats }));
    const client = createBingWebmasterClient({
      siteUrl: 'https://example.com/',
      apiKey: API_KEY,
      fetch,
    });
    const one = await client.queries({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      rowLimit: 0,
    });
    expect(one.map((row) => row.query)).toEqual(['signalkit']);
    const all = await client.queries({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      rowLimit: Number.MAX_SAFE_INTEGER,
    });
    expect(all).toHaveLength(3);
  });
  it('never leaks the api key or the body when the provider rejects', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(`Forbidden: bad apikey ${API_KEY}`, { status: 403 }),
    );
    const client = createBingWebmasterClient({
      siteUrl: 'https://example.com/',
      apiKey: API_KEY,
      fetch,
    });
    const failure = await client.queries({ startDate: '2026-03-01', endDate: '2026-03-31' }).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure!.message).toBe('Search console request rejected');
    expect(String(failure)).not.toContain(API_KEY);
    expect(String(failure)).not.toContain('Forbidden');
    expect(String(failure)).not.toContain('403');
  });
  it('treats invalid JSON as an invalid response and empty payloads as no rows', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('{"d":[', { status: 200 }))
      .mockResolvedValueOnce(json({ d: 'nope' }));
    const client = createBingWebmasterClient({
      siteUrl: 'https://example.com/',
      apiKey: API_KEY,
      fetch,
    });
    const request = { startDate: '2026-03-01', endDate: '2026-03-31' };
    await expect(client.queries(request)).rejects.toThrow('Search console response invalid');
    await expect(client.queries(request)).resolves.toEqual([]);
  });
  it('validates configuration without echoing the key', () => {
    expect(() =>
      createBingWebmasterClient({ siteUrl: 'https://example.com/', apiKey: ' ' }),
    ).toThrow('Search console credential unavailable');
    expect(() => createBingWebmasterClient({ siteUrl: 'sc-domain:x', apiKey: API_KEY })).toThrow(
      'Invalid search console site',
    );
  });
  it('rejects when the caller aborts the request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const client = createBingWebmasterClient({
      siteUrl: 'https://example.com/',
      apiKey: API_KEY,
      fetch,
    });
    const controller = new AbortController();
    const pending = client.queries(
      { startDate: '2026-03-01', endDate: '2026-03-31' },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toThrow('Search console request aborted');
  });
});

describe('mergeSearchRows', () => {
  it('flattens engines and orders by clicks then impressions', () => {
    const google: SearchQueryRow[] = [
      { engine: 'google', query: 'a', clicks: 5, impressions: 10, ctr: 0.5, position: 1 },
      { engine: 'google', query: 'b', clicks: 1, impressions: 90, ctr: 0.01, position: 9 },
    ];
    const bing: SearchQueryRow[] = [
      { engine: 'bing', query: 'c', clicks: 5, impressions: 50, ctr: 0.1, position: 2 },
      { engine: 'bing', query: 'd', clicks: 1, impressions: 5, ctr: 0.2, position: 3 },
    ];
    const merged = mergeSearchRows([google, bing]);
    expect(merged.map((row) => `${row.engine}:${row.query}`)).toEqual([
      'bing:c',
      'google:a',
      'google:b',
      'bing:d',
    ]);
    expect(google[0]?.query).toBe('a');
    expect(mergeSearchRows([])).toEqual([]);
  });
});
