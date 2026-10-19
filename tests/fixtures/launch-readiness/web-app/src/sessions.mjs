// Sessions: a random token in a cookie, mapped to a user id on the server.
import { randomBytes } from 'node:crypto';

const sessions = new Map();

export function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { userId, created: Date.now() });
  return token;
}

export function sessionCookie(token) {
  return `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`;
}

export function currentUser(req, store) {
  const cookie = req.headers.cookie || '';
  const m = /(?:^|;\s*)sid=([0-9a-f]+)/.exec(cookie);
  const s = m && sessions.get(m[1]);
  return s ? store.users.find((u) => u.id === s.userId) || null : null;
}
