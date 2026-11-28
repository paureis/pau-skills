// The customers who can book, with the name and email address their invoices go to.
import { BookingError } from './errors.js';

const ID = /^[a-z0-9-]{2,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAX_NAME = 100;

/** An empty customer directory. */
export function createDirectory() {
  return new Map();
}

/** Adds a customer { id, name, email } and returns it. Ids are unique; the email is kept in lower case. */
export function addCustomer(directory, { id, name, email }) {
  if (typeof id !== 'string' || !ID.test(id)) throw new BookingError('BAD_CUSTOMER', `bad customer id ${id}`);
  if (directory.has(id)) throw new BookingError('DUPLICATE_CUSTOMER', `customer ${id} already exists`);
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) {
    throw new BookingError('BAD_NAME', `a customer needs a name of 1 to ${MAX_NAME} characters`);
  }
  if (typeof email !== 'string' || !EMAIL.test(email)) throw new BookingError('BAD_EMAIL', `bad email address ${email}`);
  const customer = { id, name: name.trim(), email: email.toLowerCase() };
  directory.set(id, customer);
  return customer;
}

/** The customer with this id; throws a BookingError UNKNOWN_CUSTOMER for any other id. */
export function getCustomer(directory, id) {
  const customer = directory.get(id);
  if (!customer) throw new BookingError('UNKNOWN_CUSTOMER', `no customer with id ${id}`);
  return customer;
}

/** The customers whose name holds the text, in any case, sorted by name. */
export function findCustomers(directory, text) {
  const needle = String(text).trim().toLowerCase();
  return [...directory.values()]
    .filter((c) => c.name.toLowerCase().includes(needle))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
