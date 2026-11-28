import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, formatVersion, versionOrder } from '../src/version.js';

test('a version is read with or without a leading v', () => {
  assert.deepEqual(parseVersion('1.4.2'), { major: 1, minor: 4, patch: 2 });
  assert.deepEqual(parseVersion('v0.10.0'), { major: 0, minor: 10, patch: 0 });
});

test('text that is not a version is refused', () => {
  for (const text of ['1.4', '1.4.2.1', '01.4.2', 'latest', '']) assert.throws(() => parseVersion(text), RangeError, text);
});

test('a version prints without the v', () => {
  assert.equal(formatVersion(parseVersion('v2.0.1')), '2.0.1');
});

test('versions are ordered by number, not as text', () => {
  assert.ok(versionOrder('1.10.0', '1.9.0') > 0);
  assert.ok(versionOrder('1.2.3', '1.2.4') < 0);
  assert.equal(versionOrder('v1.2.3', '1.2.3'), 0);
});
