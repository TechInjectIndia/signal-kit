import assert from 'node:assert/strict';
export function releaseTag(version) {
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/,
  );
  return version.includes('-') ? version.split('-')[1].split('.')[0] : 'latest';
}
