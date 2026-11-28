import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageCount, pageLabel, pageSlice } from '../src/pages.js';

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

const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

test('page 1 holds the first items', () => {
  assert.deepEqual(pageSlice(letters, 1, 3), { items: ['a', 'b', 'c'], page: 1, totalPages: 3, hasPrev: false, hasNext: true });
});

test('the last page holds what is left and has no next page', () => {
  assert.deepEqual(pageSlice(letters, 3, 3), { items: ['g'], page: 3, totalPages: 3, hasPrev: true, hasNext: false });
});

test('a page past the end is empty', () => {
  assert.deepEqual(pageSlice(letters, 5, 3), { items: [], page: 5, totalPages: 3, hasPrev: true, hasNext: false });
});

test('an empty list has no pages', () => {
  assert.deepEqual(pageSlice([], 1, 10), { items: [], page: 1, totalPages: 0, hasPrev: false, hasNext: false });
});

test('a page below 1 or a page size below 1 is refused', () => {
  assert.throws(() => pageSlice(letters, 0, 3), RangeError);
  assert.throws(() => pageSlice(letters, 1.5, 3), RangeError);
  assert.throws(() => pageSlice(letters, 1, 0), RangeError);
});

test('the list passed in is left as it was', () => {
  const list = [...letters];
  pageSlice(list, 2, 3);
  assert.deepEqual(list, letters);
});
