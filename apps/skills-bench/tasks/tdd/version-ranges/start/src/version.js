// Release versions as MAJOR.MINOR.PATCH, with an optional leading "v". Pre-release and build tags are not used here.

const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** { major, minor, patch } for "1.4.2" or "v1.4.2"; throws a RangeError for anything else. */
export function parseVersion(text) {
  const m = typeof text === 'string' ? VERSION.exec(text.trim()) : null;
  if (!m) throw new RangeError(`not a version: ${text}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** "1.4.2" for { major, minor, patch }. */
export function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

/**
 * Negative, zero or positive as version a comes before, with or after version b, so it can be passed to sort.
 * Each side is a version string or what parseVersion returns.
 */
export function versionOrder(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a;
  const y = typeof b === 'string' ? parseVersion(b) : b;
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}
