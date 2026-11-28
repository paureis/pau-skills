// Paging for the list screens. Pages are numbered from 1.

function wholeAtLeast(name, value, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`${name} must be a whole number of ${min} or more, got ${value}`);
  }
}

/** How many pages total items fill at perPage items a page. No items is 0 pages. */
export function pageCount(total, perPage) {
  wholeAtLeast('total', total, 0);
  wholeAtLeast('perPage', perPage, 1);
  return Math.ceil(total / perPage);
}

/** "Page 2 of 5" for the footer; "No pages" when there are none. */
export function pageLabel(page, pages) {
  wholeAtLeast('pages', pages, 0);
  if (pages === 0) return 'No pages';
  wholeAtLeast('page', page, 1);
  return `Page ${page} of ${pages}`;
}

/**
 * One page of a list: { items, page, totalPages, hasPrev, hasNext }. A page past the end has no items. The list
 * passed in is left as it was.
 */
export function pageSlice(items, page, perPage) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  wholeAtLeast('page', page, 1);
  const totalPages = pageCount(items.length, perPage);
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}
