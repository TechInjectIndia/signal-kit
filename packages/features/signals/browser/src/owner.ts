/**
 * Module-level guard so only one SDK instance intercepts history, fetch and XHR per page.
 * Refused starts are counted for the attribution self-check; nothing else is retained.
 */
let activeOwner: object | undefined;
let refusedStarts = 0;
export function claimOwner(owner: object): boolean {
  if (activeOwner && activeOwner !== owner) {
    refusedStarts += 1;
    return false;
  }
  activeOwner = owner;
  return true;
}
export function releaseOwner(owner: object) {
  if (activeOwner === owner) activeOwner = undefined;
}
export function ownerState() {
  return { active: activeOwner !== undefined, refusedStarts };
}
