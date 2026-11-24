// Rule 1 of tests/description-rules.test.mjs on fixtures: every character outside printable ASCII (U+0020 to U+007E)
// is flagged, at both ends of the range and of a description. The rule and why it exists are in that file's header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ch, rule1, expectProblems } from './description-rules.helpers.mjs';

const checks = { rule1 };

// The marks rule 1 named before Q19: Unicode's Quotation_Mark set without the ASCII apostrophe and double quote, and
// three look-alikes. Kept here as numbers of its own, so the fixtures do not depend on the check's code.
const QUOTE_MARKS = [0xab, 0xbb, 0x2018, 0x2019, 0x201a, 0x201b, 0x201c, 0x201d, 0x201e, 0x201f, 0x2039, 0x203a, 0x2e42,
  0x300c, 0x300d, 0x300e, 0x300f, 0x301d, 0x301e, 0x301f, 0xfe41, 0xfe42, 0xfe43, 0xfe44, 0xff02, 0xff07, 0xff62, 0xff63];
const LOOK_ALIKES = [0xb4, 0x2bc, 0x2032];

// U+ and at least four uppercase hex digits, worked out here rather than with the check's code.
function uPlus(n) {
  const hex = n.toString(16).toUpperCase();
  return `U+${'0'.repeat(Math.max(0, 4 - hex.length))}${hex}`;
}

const TAIL = '; a description is printable ASCII only (U+0020 to U+007E)';
const SAID = " Use when the user says 'plan the work'.";
// Rule 1 on skill a/b: no problem when names is empty, else one problem naming them in that order.
function rule1Gives(description, names) {
  const problems = expectProblems(checks.rule1([{ id: 'a/b', description }]), names.length ? 1 : 0, 'a/b: rule 1: ', description);
  if (names.length) assert.equal(problems[0], 'a/b: rule 1: holds ' + names.map(uPlus).join(', ') + TAIL);
}
// The three places: first, inside and last (after the final period).
const places = (s) => [`${s}Plans the work.${SAID}`, `Plans the work${s} for you.${SAID}`, `Plans the work.${SAID}${s}`];

test('rule 1 flags every character outside U+0020 to U+007E, at both ends of the range and of a description', () => {
  // Every UTF-16 unit, lone surrogate halves included (each is one character on its own).
  for (let n = 0; n <= 0xffff; n++) {
    for (const description of places(ch(n))) rule1Gives(description, n >= 0x20 && n <= 0x7e ? [] : [n]);
  }
  for (const [n, bad] of [[0x09, true], [0x1f, true], [0x7f, true], [0x20, false], [0x7e, false], [0x27, false], [0x22, false]]) {
    for (const description of places(ch(n))) rule1Gives(description, bad ? [n] : []);
  }
  assert.equal(QUOTE_MARKS.length, 28);
  const PASSED_IN_Q18 = [0xe9, 0xb7, 0x2033];
  const REVIEW_GAPS = [0xff1f, 0x275b, 0x275c, 0x275d, 0x275e];
  const ASTRAL = [0x1f600, 0x10000, 0x10001, 0x1d400, 0x20000, 0xe0001, 0xe0041, 0xe007f, 0x10fffe, 0x10ffff];
  for (const n of [...QUOTE_MARKS, ...LOOK_ALIKES, ...PASSED_IN_Q18, ...REVIEW_GAPS, ...ASTRAL]) {
    for (const description of places(String.fromCodePoint(n))) rule1Gives(description, [n]);
  }

  rule1Gives(`Checks work. Use when the user says 'check the work' or 'is it ready${ch(0xff1f)}'.`, [0xff1f]);
  rule1Gives(`Plans the work. Use when the user says ${ch(0x2018)}plan the work${ch(0x2019)} or 'make a plan'.`, [0x2018, 0x2019]);
  rule1Gives(`Plans the caf${ch(0xe9)} and caf${ch(0xe9)} work.${SAID}`, [0xe9]);
  rule1Gives(`Plans the user'${ch(0x2019)}s work.${SAID}`, [0x2019]);
  const long = `${ch(0x2018)}Plans the work.${' Plans it.'.repeat(50)} caf${ch(0xe9)}.${' Plans it.'.repeat(50)}${SAID}${ch(0x2019)}`;
  assert.ok(long.length > 1000);
  rule1Gives(long, [0x2018, 0xe9, 0x2019]);
  rule1Gives(`${ch(0x2018)}Plans the caf${ch(0xe9)} work${ch(0xb7)}.${SAID}${ch(0x2019)}`, [0x2018, 0xe9, 0xb7, 0x2019]);

  // Several skills in one call: each bad one is named, in order, and a good one never.
  const good = `Plans the work.${SAID}`;
  const bad = (n) => good + ch(n);
  const one = (id, n) => id + ': rule 1: holds ' + uPlus(n) + TAIL;
  for (const [skills, want] of [[[['a/b', good], ['c/d', bad(0x2019)]], [one('c/d', 0x2019)]],
    [[['c/d', bad(0x2019)], ['a/b', good]], [one('c/d', 0x2019)]],
    [[['c/d', bad(0x2018)], ['a/b', good], ['e/f', bad(0xe9)]], [one('c/d', 0x2018), one('e/f', 0xe9)]]]) {
    const problems = checks.rule1(skills.map(([id, description]) => ({ id, description })));
    expectProblems(problems, want.length, '', skills.map(([, d]) => d).join(' '));
    assert.deepEqual(problems, want);
  }
});
