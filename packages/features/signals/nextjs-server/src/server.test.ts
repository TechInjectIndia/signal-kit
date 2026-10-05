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
