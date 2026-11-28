import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satisfies } from '../src/range.js';
import { newestMatching } from '../src/releases.js';

const inside = (range, ...versions) => { for (const v of versions) assert.equal(satisfies(v, range), true, `${v} in ${range}`); };
const outside = (range, ...versions) => { for (const v of versions) assert.equal(satisfies(v, range), false, `${v} not in ${range}`); };

test('an exact version, with or without =, matches only that version', () => {
  inside('1.2.3', '1.2.3', 'v1.2.3');
  outside('1.2.3', '1.2.4', '1.3.3', '0.2.3');
  inside('=2.0.0', '2.0.0');
  outside('=2.0.0', '2.0.1');
});

test('comparisons include or leave out the version as written', () => {
  inside('>=1.2.0', '1.2.0', '1.2.1', '4.0.0');
  outside('>=1.2.0', '1.1.9', '0.9.0');
  inside('>1.2.0', '1.2.1');
  outside('>1.2.0', '1.2.0');
  inside('<=2.0.0', '2.0.0', '1.9.9');
  outside('<=2.0.0', '2.0.1');
  inside('<2.0.0', '1.99.99');
  outside('<2.0.0', '2.0.0');
});

test('a caret range runs up to the next major', () => {
  inside('^1.2.3', '1.2.3', '1.2.10', '1.10.0', '1.99.99');
  outside('^1.2.3', '1.2.2', '2.0.0', '0.9.9');
});

test('below 1.0.0 the caret runs up to the next minor, and below 0.1.0 it allows one version', () => {
  inside('^0.2.3', '0.2.3', '0.2.99');
  outside('^0.2.3', '0.3.0', '0.2.2', '1.0.0');
  inside('^0.0.3', '0.0.3');
  outside('^0.0.3', '0.0.4', '0.1.0');
});

test('a tilde range runs up to the next minor', () => {
  inside('~1.2.3', '1.2.3', '1.2.50');
  outside('~1.2.3', '1.3.0', '1.2.2', '2.0.0');
  inside('~0.4.0', '0.4.7');
  outside('~0.4.0', '0.5.0');
});

test('two parts with a space between them must both hold', () => {
  inside('>=1.2.0 <1.5.0', '1.2.0', '1.4.99');
  outside('>=1.2.0 <1.5.0', '1.5.0', '1.1.99');
});

test('a range or a version that cannot be read throws a RangeError', () => {
  for (const range of ['abc', '1.2', '', '^', '1.2.3.4']) {
    assert.throws(() => satisfies('1.2.3', range), RangeError, JSON.stringify(range));
  }
  assert.throws(() => satisfies('one', '^1.0.0'), RangeError);
});

test('newestMatching picks the highest version inside the range, by number', () => {
  const releases = ['1.9.0', '2.1.0', '1.10.0', 'v1.2.0', '1.10.1', '0.9.0'];
  assert.equal(newestMatching(releases, '^1.2.0'), '1.10.1');
  assert.equal(newestMatching(releases, '~1.9.0'), '1.9.0');
  assert.equal(newestMatching(releases, '<1.3.0'), 'v1.2.0');
});

test('newestMatching gives null when nothing is inside the range', () => {
  assert.equal(newestMatching(['1.0.0', '2.0.0'], '^3.0.0'), null);
  assert.equal(newestMatching([], '^1.0.0'), null);
});
