// Shared parts of the description rule tests: the rule 1 check and the message checks. tests/description-rules.test.mjs
// runs every rule on the repository; tests/description-rules-ascii.test.mjs holds the long rule 1 fixtures.
import assert from 'node:assert/strict';

// Rule 1: the first and last printable ASCII characters (the space and the tilde).
const FIRST = 0x20;
const LAST = 0x7e;
const codePoint = (n) => `U+${n.toString(16).toUpperCase().padStart(4, '0')}`;

export const ch = (n) => String.fromCharCode(n);

// Rule 1 on the read skills ({ id, description }): a problem per skill that holds a character outside the range.
export const rule1 = (skills) => skills.flatMap(({ id, description }) => {
  const found = [];
  for (const c of description) {
    const n = c.codePointAt(0);
    if ((n < FIRST || n > LAST) && !found.includes(n)) found.push(n);
  }
  if (!found.length) return [];
  return [`${id}: rule 1: holds ${found.map(codePoint).join(', ')}; a description is printable ASCII only (U+0020 to U+007E)`];
});

// Checks the count and the start of each message, that it is printable ASCII, and that it holds none of the phrases
// quoted in the fixture (read here with a plain pattern of its own, not with QUOTED; a piece of three characters or
// fewer, such as the dot after a doubled quote, is too short to tell).
export function expectProblems(problems, count, prefix, description) {
  assert.equal(problems.length, count, `expected ${count} problem(s), got ${JSON.stringify(problems)}`);
  for (const p of problems) {
    assert.ok(p.startsWith(prefix), `${JSON.stringify(p)} starts with ${JSON.stringify(prefix)}`);
    assert.match(p, /^[ -~]+$/, `${JSON.stringify(p)} is printable ASCII`);
    for (const [, phrase] of (description ?? '').matchAll(/'([^']+)'/g)) {
      if (phrase.length > 3) assert.ok(!p.includes(phrase), `${JSON.stringify(p)} holds a phrase of the description`);
    }
  }
  return problems;
}
