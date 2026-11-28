import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satisfies } from '../src/range.js';

test('satisfies exists', () => {
  assert.equal(typeof satisfies, 'function');
});
