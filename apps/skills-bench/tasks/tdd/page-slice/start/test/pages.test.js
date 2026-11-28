import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageCount, pageLabel } from '../src/pages.js';

test('a partly filled last page still counts as a page', () => {
  assert.equal(pageCount(10, 3), 4);
  assert.equal(pageCount(9, 3), 3);
});

test('no items is no pages', () => {
  assert.equal(pageCount(0, 10), 0);
});

test('a page size below 1 is refused', () => {
  assert.throws(() => pageCount(10, 0), RangeError);
  assert.throws(() => pageCount(10, 2.5), RangeError);
});

test('the footer label names the page and the page count', () => {
  assert.equal(pageLabel(2, 5), 'Page 2 of 5');
  assert.equal(pageLabel(1, 0), 'No pages');
});
