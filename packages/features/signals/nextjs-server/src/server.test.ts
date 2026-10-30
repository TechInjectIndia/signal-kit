import { expect, it, vi } from 'vitest';
import { createNextRequestErrorHandler } from './index.js';
it('reports normalized request failure without serializing private error/header details', async () => {
  const record = vi.fn();
  const hook = createNextRequestErrorHandler({ record });
  await hook(
    new Error('secret'),
    { path: '/users/123?token=private', method: 'get' },
    { routePath: '/users/[id]' },
  );
  expect(record).toHaveBeenCalledWith({
    kind: 'request',
    route: '/users/[id]',
    method: 'GET',
    status: 500,
    durationMs: 0,
    error: true,
  });
  await expect(
    createNextRequestErrorHandler({
      record() {
        throw new Error('collector');
      },
    })(null, { path: '/', method: 'GET' }, {}),
  ).resolves.toBeUndefined();
});

it('correlates error records with traceparent headers or context (5.1)', async () => {
  const record = vi.fn();
  const hook = createNextRequestErrorHandler({ record });
  await hook(
    new Error('crash'),
    {
      path: '/api/checkout',
      method: 'POST',
      headers: {
        traceparent: '00-0123456789abcdef0123456789abcdef-fedcba9876543210-01',
      },
    },
    { routePath: '/api/checkout' },
  );
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'request',
      route: '/api/checkout',
      traceId: '0123456789abcdef0123456789abcdef',
      parentSpanId: 'fedcba9876543210',
      error: true,
    }),
  );
});
