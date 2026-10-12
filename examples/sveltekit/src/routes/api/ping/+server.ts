import type { RequestHandler } from '@sveltejs/kit';
export const GET: RequestHandler = async ({ fetch }) => {
  const response = await fetch('/api/upstream');
  return new Response(await response.text(), { headers: { 'content-type': 'application/json' } });
};
