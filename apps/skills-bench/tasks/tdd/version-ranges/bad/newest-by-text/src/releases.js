// The release list of a package: which version is newest, what the next one is called and how the notes start.
import { parseVersion, formatVersion, versionOrder } from './version.js';
import { satisfies } from './range.js';

const BUMPS = new Map([
  ['major', (v) => ({ major: v.major + 1, minor: 0, patch: 0 })],
  ['minor', (v) => ({ major: v.major, minor: v.minor + 1, patch: 0 })],
  ['patch', (v) => ({ major: v.major, minor: v.minor, patch: v.patch + 1 })],
]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The versions oldest first, each as given; throws a RangeError on any that is not a version. */
export function sortReleases(versions) {
  return [...versions].sort(versionOrder);
}

/** The newest of the versions, as given, or null for an empty list. */
export function latest(versions) {
  const sorted = sortReleases(versions);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/** The highest of the versions inside the range, as given, or null when none is. The list can be in any order. */
export function newestMatching(versions, range) {
  const inside = versions.filter((v) => satisfies(v, range)).sort();
  return inside.length ? inside[inside.length - 1] : null;
}

/** The version after this one for a "major", "minor" or "patch" release. */
export function nextVersion(version, bump) {
  const step = BUMPS.get(bump);
  if (!step) throw new RangeError(`bump must be major, minor or patch, got ${bump}`);
  return formatVersion(step(parseVersion(version)));
}

/** The releases newer than a version, oldest first, each as given. */
export function releasesAfter(versions, version) {
  return sortReleases(versions).filter((v) => versionOrder(v, version) > 0);
}

/** The newest release of each major line, highest major first, for the support table. */
export function majorLines(versions) {
  const newest = new Map();
  for (const v of sortReleases(versions)) newest.set(parseVersion(v).major, v);
  return [...newest.values()].reverse();
}

/** The bump a set of change kinds calls for: any "breaking" is major, any "feature" is minor, else patch. */
export function bumpFor(kinds) {
  if (kinds.includes('breaking')) return 'major';
  if (kinds.includes('feature')) return 'minor';
  return 'patch';
}

/** The release notes heading, "## 1.4.0 (2026-03-02)", for a version and the day it went out. */
export function notesHeading(version, day) {
  if (typeof day !== 'string' || !DAY.test(day)) throw new RangeError(`day must be YYYY-MM-DD, got ${day}`);
  return `## ${formatVersion(parseVersion(version))} (${day})`;
}
