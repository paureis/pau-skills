/**
 * The evidence rules of the launch-readiness ledger (Node standard library): what a row needs before it is written,
 * which checks need a probe to pass (read from the "(stage, severity, probe)" tags in areas/*.md), secret values kept
 * out of the evidence, and cited paths kept inside the repository.
 */
import { readFileSync, readdirSync, realpathSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AREAS = join(dirname(fileURLToPath(import.meta.url)), 'areas');

/** Check ids whose area file tags them "probe": they pass only on a probe run. */
export const PROBE_IDS = new Set(readdirSync(AREAS).filter((f) => f.endsWith('.md')).flatMap((f) =>
  [...readFileSync(join(AREAS, f), 'utf8').matchAll(/\*\*([A-Z]+-\d+[A-Z]?) [^*]+\*\* \(([^)]*)\)/g)]
    .filter((m) => /\bprobe\b/.test(m[2])).map((m) => m[1])));

// Known key shapes, and long random tokens: upper and lower case and digits, two of each at least, high entropy.
const KEY_SHAPES = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}|\bxox[abprs]-[A-Za-z0-9-]{10,}|\bAIza[\w-]{30,}|\bsk-(?:ant-)?[\w-]{20,}|\bglpat-[\w-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[\w-]{10,}\.[\w-]{10,}/;

function entropy(s) {
  const n = {};
  for (const c of s) n[c] = (n[c] || 0) + 1;
  return Object.values(n).reduce((h, k) => h - (k / s.length) * Math.log2(k / s.length), 0);
}

/** The first secret-looking value in a text, or null. */
export function secretIn(text) {
  const m = KEY_SHAPES.exec(text);
  if (m) return m[0];
  const count = (t, re) => (t.match(re) || []).length;
  return String(text).split(/[^A-Za-z0-9+=_-]+/).find((t) => t.length >= 20 && count(t, /[A-Z]/g) >= 2
    && count(t, /[a-z]/g) >= 2 && count(t, /[0-9]/g) >= 2 && entropy(t) >= 3.7) || null;
}

/** The path relative to the root, refusing one outside it: "../", absolute, or a link that leads out. */
export function insideRoot(root, p) {
  const rel = String(p).split(sep).join('/').replace(/^\.\//, '');
  const out = `${rel} is outside the repository; cite paths from the repository root`;
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../')) throw new Error(out);
  const abs = resolve(root, rel);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`cited file ${rel} does not exist (paths are from the repository root)`);
  const back = relative(realpathSync(root), realpathSync(abs));
  if (back.startsWith('..') || isAbsolute(back)) throw new Error(out);
  return { rel, abs };
}

/** Why a row may not be written, as a list of reasons. */
export function evidenceRules(r) {
  const why = [];
  const has = (s) => s && String(s).trim();
  const run = r.source === 'command' || r.source === 'probe';
  if (r.status === 'pass' && r.source === 'code' && !/[^\s:]+:\d+/.test(r.evidence)) why.push('a code pass needs file:line in its evidence');
  if (r.status === 'pass' && r.source === 'code' && !r.files.length) why.push('a code pass cites the file it read');
  if (run && !r.files.length) why.push(`a ${r.source} row lists its input files (a dependency audit cites the lockfile, a probe its test file)`);
  if ((run || r.source === 'answer') && !r.expires) why.push(`a ${r.source} row carries an expiry`);
  if (PROBE_IDS.has(r.id) && r.status === 'pass' && r.source !== 'probe') why.push(`${r.id} needs a probe to pass: record the probe run with source "probe", or grade it likely`);
  if (/-NA$/.test(r.id) && (r.stage !== 1 || r.severity !== 'must-fix')) why.push(`${r.id} is an area n/a row, must-fix at stage 1, so the area blocks go if it comes back`);
  if (['pass', 'fail', 'likely'].includes(r.status) && !has(r.evidence)) why.push(`a ${r.status} row needs its evidence`);
  if (r.status === 'unknown' && !has(r.evidence)) why.push('an unknown row says how to check it');
  if (r.status === 'n/a' && !has(r.evidence)) why.push('an n/a row gives the profile reason');
  const secret = secretIn(r.evidence || '');
  if (secret) why.push(`the evidence holds what looks like a secret value ("${secret.slice(0, 4)}..."): cite its file:line and never the value; show at most the first 4 characters followed by "..."`);
  return why;
}
