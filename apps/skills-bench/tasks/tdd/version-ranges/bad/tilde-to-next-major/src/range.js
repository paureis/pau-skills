// Version ranges as package manifests write them: an exact version, a comparison (>=, >, <=, <), a caret or a tilde
// range, or two of these with a space between them that must both hold.
import { parseVersion, versionOrder } from './version.js';

const COMPARATOR = /^(>=|<=|>|<|=|\^|~)?(v?\d+\.\d+\.\d+)$/;

/** The first version a caret range leaves out: the next major, or below 1.0.0 the next minor, or below 0.1.0 the next patch. */
function caretEnd(v) {
  if (v.major > 0) return { major: v.major + 1, minor: 0, patch: 0 };
  if (v.minor > 0) return { major: 0, minor: v.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: v.patch + 1 };
}

/** The first version a tilde range leaves out: the next minor. */
function tildeEnd(v) {
  return { major: v.major + 1, minor: 0, patch: 0 };
}

/** One comparator as a check on a parsed version. */
function comparator(text, range) {
  const m = COMPARATOR.exec(text);
  if (!m) throw new RangeError(`not a version range: ${range}`);
  const v = parseVersion(m[2]);
  const from = (x) => versionOrder(x, v);
  const within = (end) => (x) => from(x) >= 0 && versionOrder(x, end) < 0;
  switch (m[1] ?? '=') {
    case '=': return (x) => from(x) === 0;
    case '>=': return (x) => from(x) >= 0;
    case '>': return (x) => from(x) > 0;
    case '<=': return (x) => from(x) <= 0;
    case '<': return (x) => from(x) < 0;
    case '^': return within(caretEnd(v));
    default: return within(tildeEnd(v));
  }
}

/** True when the version is inside the range. Throws a RangeError for a version or a range it cannot read. */
export function satisfies(version, range) {
  const v = parseVersion(version);
  const parts = typeof range === 'string' ? range.trim().split(/\s+/) : [];
  if (parts.length < 1 || parts.length > 2 || parts[0] === '') throw new RangeError(`not a version range: ${range}`);
  return parts.map((p) => comparator(p, range)).every((ok) => ok(v));
}
