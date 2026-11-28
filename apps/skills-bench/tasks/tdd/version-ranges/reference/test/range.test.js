import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satisfies } from '../src/range.js';

const check = (range, inside, outside) => {
  for (const v of inside) assert.equal(satisfies(v, range), true, `${v} should be inside ${range}`);
  for (const v of outside) assert.equal(satisfies(v, range), false, `${v} should be outside ${range}`);
};

test('an exact version matches only itself', () => {
  check('1.2.3', ['1.2.3', 'v1.2.3'], ['1.2.4', '1.2.2']);
  check('=1.2.3', ['1.2.3'], ['1.3.0']);
});

test('at least includes the version itself, more than does not', () => {
  check('>=1.2.0', ['1.2.0', '3.0.0'], ['1.1.9']);
  check('>1.2.0', ['1.2.1'], ['1.2.0']);
});

test('at most includes the version itself, less than does not', () => {
  check('<=2.0.0', ['2.0.0', '0.1.0'], ['2.0.1']);
  check('<2.0.0', ['1.99.0'], ['2.0.0']);
});

test('a caret range stays below the next major', () => {
  check('^1.2.3', ['1.2.3', '1.9.9'], ['1.2.2', '2.0.0']);
});

test('below 1.0.0 a caret range stays below the next minor, below 0.1.0 it is one version', () => {
  check('^0.2.3', ['0.2.3', '0.2.9'], ['0.3.0', '0.2.2']);
  check('^0.0.3', ['0.0.3'], ['0.0.4', '0.1.0']);
});

test('a tilde range stays below the next minor', () => {
  check('~1.2.3', ['1.2.3', '1.2.9'], ['1.3.0', '1.2.2']);
});

test('two parts must both hold', () => {
  check('>=1.2.0 <1.5.0', ['1.2.0', '1.4.9'], ['1.5.0', '1.1.0']);
});

test('a range or version that cannot be read is refused', () => {
  for (const range of ['abc', '1.2', '', '>= 1.2.0', '^1.x']) assert.throws(() => satisfies('1.2.3', range), RangeError, range);
  assert.throws(() => satisfies('1.2', '^1.0.0'), RangeError);
});
