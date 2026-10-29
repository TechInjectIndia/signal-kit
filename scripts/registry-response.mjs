import assert from 'node:assert/strict';

// npm 10 returns a field directly; npm 12 wraps the selected version in an array.
export function registryField(text) {
  const response = JSON.parse(text);
  if (!Array.isArray(response)) return response;
  assert.equal(response.length, 1, 'Expected exactly one selected registry version');
  assert.ok(!Array.isArray(response[0]), 'Unexpected nested registry response');
  return response[0];
}
