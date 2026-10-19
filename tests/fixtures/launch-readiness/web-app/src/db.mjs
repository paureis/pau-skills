// In-memory data store. A real deployment would swap this for a database.
import { scryptSync, randomBytes } from 'node:crypto';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function createStore() {
  const users = [
    { id: 'u1', email: 'alice@example.com', name: 'Alice Moore', passwordHash: hashPassword('correct horse') },
    { id: 'u2', email: 'bob@example.com', name: 'Bob Stone', passwordHash: hashPassword('correct horse') },
  ];
  const records = [
    { id: 'r1', ownerId: 'u1', title: 'Alice journal', body: 'Private notes of Alice.' },
    { id: 'r2', ownerId: 'u2', title: 'Bob journal', body: 'Private notes of Bob.' },
  ];
  const orders = [];
  return { users, records, orders };
}
