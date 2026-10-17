#!/usr/bin/env node
// Ratchet for a pattern that is already common. It counts the lines that match a regular expression in the files
// that git pathspec globs choose (tracked and untracked, not ignored), compares the count with a committed baseline
// file that holds one number, and fails when a change adds more. When the count drops it fails too and asks for the
// baseline to be lowered in the same change (--update does that, and never raises it), so the count cannot climb back.
//
// Exceptions go on the offending line, in any comment syntax:
//   <comment marker> <check id>: allowed until YYYY-MM-DD, <reason>, approved by <role or handle>
// A line with a valid exception is not counted. An expired or incomplete exception fails the check.
//
// usage: node ratchet.mjs --id no-env-read --pattern 'os\.environ' --files '**/*.py' [--files ...]
//          --instead 'config.load() from app/config' --baseline .ratchet/no-env-read.txt [--update] [--today YYYY-MM-DD]
// Run it from the repository root, the same way locally and in CI. Exit 0 pass, 1 check failed, 2 usage error.
// Node.js 20+, standard library only.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const USAGE = 'usage: node ratchet.mjs --id <check id> --pattern <regex> --files <glob> [--files <glob>] '
  + '--instead <what to use instead> --baseline <file> [--update] [--today YYYY-MM-DD]';
const fail = (code, msg) => { process.stderr.write(`${msg}\n`); process.exit(code); };
const isDate = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let o;
try {
  o = parseArgs({ options: {
    id: { type: 'string' }, pattern: { type: 'string' }, files: { type: 'string', multiple: true },
    instead: { type: 'string' }, baseline: { type: 'string' }, update: { type: 'boolean' }, today: { type: 'string' },
  } }).values;
} catch (e) { fail(2, `${e.message}\n${USAGE}`); }
for (const k of ['id', 'pattern', 'files', 'instead', 'baseline']) if (!o[k]?.length) fail(2, `missing --${k}\n${USAGE}`);
let re;
try { re = new RegExp(o.pattern); } catch (e) { fail(2, `bad --pattern: ${e.message}`); }
const today = o.today ?? new Date().toISOString().slice(0, 10);
if (!isDate(today)) fail(2, `bad --today: ${today}, expected YYYY-MM-DD`);

const MARK = new RegExp(`${escape(o.id)}: allowed\\b`);
const FULL = new RegExp(`${escape(o.id)}: allowed until (\\S+), (\\S.*?), approved by (\\S+)`);

let files;
try {
  const out = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', '--', ...o.files.map((g) => `:(glob)${g}`)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  files = [...new Set(out.split('\0').filter(Boolean))];
} catch (e) { fail(2, `git ls-files failed; run this inside a git repository: ${String(e.stderr || e.message).trim()}`); }

const hits = [];
const bad = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; } // deleted in the working tree, or not a file
  if (text.includes('\0')) continue; // binary
  text.split(/\r?\n/).forEach((line, i) => {
    const where = `${f}:${i + 1}`;
    if (MARK.test(line)) {
      const m = FULL.exec(line);
      if (!m || !isDate(m[1])) return bad.push(`${where}: incomplete exception`);
      if (m[1] < today) return bad.push(`${where}: exception expired on ${m[1]}`);
      return; // a valid exception: not counted
    }
    if (re.test(line)) hits.push(where);
  });
}

if (bad.length) {
  fail(1, `${o.id}: exceptions need "${o.id}: allowed until YYYY-MM-DD, <reason>, approved by <role or handle>" `
    + `with a date not yet passed. Renew it with a new approval, or replace the line with ${o.instead}.\n`
    + bad.map((b) => `  ${b}`).join('\n'));
}
const count = hits.length;
const has = existsSync(o.baseline);
const base = has ? Number(readFileSync(o.baseline, 'utf8').trim()) : NaN;
if (has && !Number.isInteger(base)) fail(2, `${o.baseline} must hold one whole number`);
if (o.update) {
  if (has && count > base) {
    fail(1, `${o.id}: ${count} lines match, above the baseline of ${base}. --update only lowers it. Use ${o.instead} instead.`);
  }
  writeFileSync(o.baseline, `${count}\n`);
  console.log(`${o.id}: ${count}, baseline written to ${o.baseline}; commit it`);
  process.exit(0);
}
if (!has) fail(1, `${o.id}: no baseline at ${o.baseline}. Run with --update to write the current count (${count}) and commit it.`);
if (count > base) {
  fail(1, `${o.id}: ${count} lines match /${o.pattern}/, the baseline allows ${base}. Use ${o.instead} instead.\n`
    + `Matches (compare with the base branch to find the new one):\n${hits.map((h) => `  ${h}`).join('\n')}`);
}
if (count < base) fail(1, `${o.id}: ${count} lines match, below the baseline of ${base}. Lower the baseline in this change: run with --update and commit ${o.baseline}.`);
console.log(`${o.id}: ${count} lines match, baseline ${base}`);
