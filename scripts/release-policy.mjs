import assert from 'node:assert/strict';
export function releaseTag(version) {
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/,
  );
  return version.includes('-') ? version.split('-')[1].split('.')[0] : 'latest';
}

// npm refuses to delete latest, so until the first stable release it follows the newest
// prerelease of the same channel and base version. A stable latest is never replaced.
export function shouldAdvanceLatest(tags, version) {
  const channel = releaseTag(version);
  if (channel === 'latest' || typeof tags.latest !== 'string') return false;
  let latestChannel;
  try {
    latestChannel = releaseTag(tags.latest);
  } catch {
    return false;
  }
  if (latestChannel !== channel || tags.latest.split('-')[0] !== version.split('-')[0])
    return false;
  if (
    BigInt(tags.latest.split('-')[1].split('.')[1]) >= BigInt(version.split('-')[1].split('.')[1])
  )
    return false;
  assert.equal(
    tags[channel],
    version,
    `Refusing to move latest: ${channel} must point to ${version}`,
  );
  return true;
}
