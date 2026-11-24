// Redaction for mine.mjs: hides emails, secret shapes and home folders, plus the small text helpers and the Refusal
// error that every other part of the miner shares.
import { homedir } from 'node:os';

// ---------- redaction ----------

// Every repeat is bounded, so a long line costs linear time (an unbounded local part made 100k characters take 9 s).
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63}){1,8}/g;
const TOKENS = [
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\b[rs]k_(live|test)_[A-Za-z0-9]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bglpat-[A-Za-z0-9_-]{20,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bnpm_[A-Za-z0-9]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]{0,40}PRIVATE KEY-----|$)/g,
];
// "Authorization: Bearer <token>", "Basic <base64>".
const AUTH = /\b(Bearer|Basic|Token)(\s+)[A-Za-z0-9._~+/=-]{8,}/g;
// Credentials in a URL: scheme://user:password@host.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/:@]{1,256}:[^\s/@]{1,256}@/gi;
// A key whose name holds a secret word, anywhere in an identifier (DB_PASSWORD, OPENAI_API_KEY, "password"), then
// = or :, then the value.
const KEY_VALUE = /((?<![A-Za-z0-9])[A-Za-z0-9_.-]{0,64}?(?:token|secret|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|private[_-]?key|credential)s?[A-Za-z0-9_]{0,64})(["']?\s{0,8}[:=]\s{0,8})("[^"\n]{0,512}"|'[^'\n]{0,512}'|[^\s,;}"']{1,512})/gi;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Hide emails, secret shapes and home folders in text that is about to be printed. */
export function redact(text, home = homedir()) {
  let out = String(text);
  for (const re of TOKENS) out = out.replace(re, '[secret]');
  out = out.replace(AUTH, (_, k, sp) => `${k}${sp}[secret]`);
  out = out.replace(URL_CREDENTIALS, (_, scheme) => `${scheme}[secret]@`);
  out = out.replace(KEY_VALUE, (_, k, sep) => `${k}${sep}[secret]`);
  out = out.replace(EMAIL, '[email]');
  if (home && home.length > 1) {
    for (const h of new Set([home, home.replace(/\\/g, '/')])) out = out.replace(new RegExp(escapeRe(h) + '(?=[\\\\/]|\\b|$)', 'g'), '~');
  }
  out = out.replace(/\/(home|Users)\/[^/\s'"]{1,256}/g, '~');
  out = out.replace(/\b[A-Za-z]:\\Users\\[^\\\s'"]{1,256}/g, '~');
  return out.replace(/~\\/g, '~/');
}

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
const cut = (s, max) => (s.length > max ? s.slice(0, max).trimEnd() + '...' : s);

class Refusal extends Error {}

export { oneLine, cut, Refusal };
