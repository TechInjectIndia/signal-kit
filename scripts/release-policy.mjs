import assert from 'node:assert/strict';
export function releaseTag(version) {
  assert.match(
    version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/,
  );
  return version.includes('-') ? version.split('-')[1].split('.')[0] : 'latest';
}

export function shouldCleanupLatest(tags, version) {
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
  if (BigInt(tags.latest.split('-')[1].split('.')[1]) > BigInt(version.split('-')[1].split('.')[1]))
    return false;
  assert.equal(tags[channel], version, `Refusing cleanup: retain ${channel}@${version}`);
  return true;
}
