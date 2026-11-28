// Splitting the order list into pages for the terminal.

function checkSize(size) {
  if (!Number.isInteger(size) || size < 1) throw new Error(`page size must be a whole number above 0, got ${size}`);
}

/** How many pages it takes to show total items, size per page. */
export function pageCount(total, size) {
  checkSize(size);
  return Math.ceil(total / size);
}

/** The items on a page; pages count from 1. */
export function pageOf(items, page, size) {
  const pages = pageCount(items.length, size);
  if (!Number.isInteger(page) || page < 1 || page > pages) {
    throw new Error(`no page ${page}: there ${pages === 1 ? 'is 1 page' : `are ${pages} pages`}`);
  }
  return items.slice((page - 1) * size, page * size);
}

export function pageHeader(page, total, size) {
  return `Page ${page} of ${pageCount(total, size)} (${total} orders)`;
}

/** Cents as a plain amount, 4250 -> "42.50". */
export function formatCents(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function orderLine(order) {
  return `${order.id.padEnd(8)}${order.customer.padEnd(22)}${formatCents(order.totalCents).padStart(9)} ${order.currency}`;
}

/** The first and last item numbers on a page, counting from 1, for a "showing 11 to 20" line. */
export function pageRange(page, total, size) {
  checkSize(size);
  if (total === 0) return { first: 0, last: 0 };
  const first = (page - 1) * size + 1;
  const last = Math.min(page * size, total);
  return { first, last };
}

export function isLastPage(page, total, size) {
  return page === pageCount(total, size);
}
