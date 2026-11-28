import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortReleases, latest, nextVersion, bumpFor, notesHeading, releasesAfter, majorLines } from '../src/releases.js';

test('releases sort oldest first and keep how they were written', () => {
  assert.deepEqual(sortReleases(['1.10.0', 'v1.2.0', '1.9.1']), ['v1.2.0', '1.9.1', '1.10.0']);
});

test('the latest release is the highest version', () => {
  assert.equal(latest(['1.9.0', '1.10.0', '0.9.9']), '1.10.0');
  assert.equal(latest([]), null);
});

test('the next version resets the lower numbers', () => {
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
  assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0');
  assert.equal(nextVersion('1.4.2', 'patch'), '1.4.3');
  assert.throws(() => nextVersion('1.4.2', 'huge'), RangeError);
});

test('the releases after a version come oldest first', () => {
  assert.deepEqual(releasesAfter(['2.0.0', '1.4.2', '1.10.0', '1.4.3'], '1.4.2'), ['1.4.3', '1.10.0', '2.0.0']);
});

test('each major line shows its newest release, highest major first', () => {
  assert.deepEqual(majorLines(['1.9.0', '2.0.1', '1.10.0', '0.4.0', '2.0.0']), ['2.0.1', '1.10.0', '0.4.0']);
});

test('a breaking change calls for a major release, a feature for a minor one', () => {
  assert.equal(bumpFor(['fix', 'breaking']), 'major');
  assert.equal(bumpFor(['fix', 'feature']), 'minor');
  assert.equal(bumpFor(['fix']), 'patch');
});

test('the notes heading names the version and the day', () => {
  assert.equal(notesHeading('v1.4.0', '2026-03-02'), '## 1.4.0 (2026-03-02)');
});
