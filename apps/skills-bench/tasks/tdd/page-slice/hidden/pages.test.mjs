import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageSlice } from '../src/pages.js';

const ten = Array.from({ length: 10 }, (_, i) => i + 1);

test('the first page holds the first perPage items', () => {
  assert.deepEqual(pageSlice(ten, 1, 4), { items: [1, 2, 3, 4], page: 1, totalPages: 3, hasPrev: false, hasNext: true });
});

test('a middle page has a page before and after it', () => {
  assert.deepEqual(pageSlice(ten, 2, 4), { items: [5, 6, 7, 8], page: 2, totalPages: 3, hasPrev: true, hasNext: true });
});

test('the last page holds the rest and has no next page', () => {
  assert.deepEqual(pageSlice(ten, 3, 4), { items: [9, 10], page: 3, totalPages: 3, hasPrev: true, hasNext: false });
  assert.deepEqual(pageSlice(ten, 2, 5), { items: [6, 7, 8, 9, 10], page: 2, totalPages: 2, hasPrev: true, hasNext: false });
});

test('a page past the end has no items', () => {
  assert.deepEqual(pageSlice(ten, 4, 4), { items: [], page: 4, totalPages: 3, hasPrev: true, hasNext: false });
});

test('an empty list has no pages', () => {
  assert.deepEqual(pageSlice([], 1, 5), { items: [], page: 1, totalPages: 0, hasPrev: false, hasNext: false });
});

test('a page or page size that is not a whole number of 1 or more throws a RangeError', () => {
  for (const [page, perPage] of [[0, 4], [-1, 4], [1.5, 4], [1, 0], [1, 2.5]]) {
    assert.throws(() => pageSlice(ten, page, perPage), RangeError, `${page}, ${perPage}`);
  }
});

test('the list passed in is not changed', () => {
  const list = [...ten];
  pageSlice(list, 2, 4);
  pageSlice(list, 3, 4);
  assert.deepEqual(list, ten);
});
