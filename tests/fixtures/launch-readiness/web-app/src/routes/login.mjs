// POST /api/login with { email, password }; sets the session cookie.
import { timingSafeEqual } from 'node:crypto';
import { hashPassword } from '../db.mjs';
import { createSession, sessionCookie } from '../sessions.mjs';
import { readJson, sendJson } from '../http.mjs';

function passwordMatches(user, password) {
  const [salt, expected] = user.passwordHash.split(':');
  const actual = hashPassword(password, salt).split(':')[1];
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

export async function login(req, res, store) {
  const { email, password } = await readJson(req);
  if (typeof email !== 'string' || typeof password !== 'string') return sendJson(res, 400, { error: 'email and password are required' });
  const user = store.users.find((u) => u.email === email.trim().toLowerCase());
  if (!user || !passwordMatches(user, password)) return sendJson(res, 401, { error: 'wrong email or password' });
  const token = createSession(user.id);
  return sendJson(res, 200, { id: user.id, name: user.name }, { 'Set-Cookie': sessionCookie(token) });
}
