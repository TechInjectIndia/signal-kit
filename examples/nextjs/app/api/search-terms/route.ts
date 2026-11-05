import {
  createBingWebmasterClient,
  createGoogleSearchConsoleClient,
  mergeSearchRows,
  type SearchConsoleClient,
} from '@techinject/server/search-console';

export const dynamic = 'force-dynamic';

/**
 * Organic search terms for the last 28 days from Google Search Console and Bing Webmaster Tools.
 * Credentials stay server-side and are injected through environment configuration. The host owns
 * the Google OAuth flow that produced SEARCH_CONSOLE_ACCESS_TOKEN; see the attribution guide.
 * Without configuration the route reports that honestly instead of inventing rows.
 * This handler has no authentication. Hosts must add their own access control before exposing it,
 * because the rows are private analytics data and every call consumes provider quota.
 */
export async function GET() {
  const clients: SearchConsoleClient[] = [];
  const google = process.env.SEARCH_CONSOLE_SITE_URL && process.env.SEARCH_CONSOLE_ACCESS_TOKEN;
  if (google)
    clients.push(
      createGoogleSearchConsoleClient({
        siteUrl: process.env.SEARCH_CONSOLE_SITE_URL!,
        accessToken: () => process.env.SEARCH_CONSOLE_ACCESS_TOKEN!,
      }),
    );
  if (process.env.BING_WEBMASTER_SITE_URL && process.env.BING_WEBMASTER_API_KEY)
    clients.push(
      createBingWebmasterClient({
        siteUrl: process.env.BING_WEBMASTER_SITE_URL,
        apiKey: process.env.BING_WEBMASTER_API_KEY,
      }),
    );
  if (!clients.length) return Response.json({ configured: false, rows: [] });
  const day = (offset: number) =>
    new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const request = {
    startDate: day(30),
    endDate: day(3),
    dimensions: ['query' as const],
    rowLimit: 50,
  };
  const results = await Promise.allSettled(clients.map((client) => client.queries(request)));
  return Response.json({
    configured: true,
    engines: clients.map((client, i) => ({
      engine: client.engine,
      // Safe status only: the SDK errors never carry credentials or provider bodies.
      status: results[i]?.status === 'fulfilled' ? 'ok' : 'failed',
    })),
    rows: mergeSearchRows(
      results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
    ),
  });
}
