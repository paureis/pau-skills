#!/usr/bin/env node
// Ratchet for a pattern that is already common. It counts the lines that match a regular expression in the files
// that git pathspec globs choose (tracked and untracked, not ignored), compares the count with a committed baseline
// file that holds one number, and fails when a change adds more. When the count drops it fails too and asks for the
// baseline to be lowered in the same change (--update does that, and never raises it), so the count cannot climb back.
//
// Exceptions go on the offending line, in any comment syntax:
//   <comment marker> <check id>: allowed until YYYY-MM-DD, <reason>, approved by <role or handle>
// A line with a valid exception is not counted, and every run lists it so a reviewer can check the approval: the
// script cannot tell who wrote it. An expired or incomplete exception fails the check.
//
// usage: node ratchet.mjs --id no-env-read --pattern 'os\.environ' --files '**/*.py' [--files ...]
//          --instead 'config.load() from app/config' --baseline .ratchet/no-env-read.txt [--update] [--today YYYY-MM-DD]
// It runs from the repository root whatever the current folder: --files and --baseline are relative to the root.
// Each --files value is a git glob pathspec: '*.py' matches top-level files only, '**/*.py' matches every folder.
// A value that starts with ':(' goes to git as it is, so ':(exclude)app/config.py' leaves a file out. Globs that
// match no file are an error. Run the same command locally and in CI. Exit 0 pass, 1 check failed, 2 usage error.
// Node.js 20+, standard library only.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = 'usage: node ratchet.mjs --id <check id> --pattern <regex> --files <glob> [--files <glob>] '
  + '--instead <what to use instead> --baseline <file> [--update] [--today YYYY-MM-DD]\n'
  + '--files and --baseline are relative to the repository root. Globs are git pathspecs: *.py is top level only, '
  + '**/*.py is every folder; a value starting with :( such as :(exclude)path goes to git unchanged.';
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

// The id is anchored on the left, so `no-env-read: allowed` is not an exception for `env-read`. The approver starts
// with a letter, a digit or @, so a comment closer such as `*/` or `-->` is not an approver.
const ID = `(?<![\\w-])${escape(o.id)}`;
const MARK = new RegExp(`${ID}: allowed\\b`);
const FULL = new RegExp(`${ID}: allowed until (\\S+), (\\S.*?), approved by ([A-Za-z0-9@]\\S*)`);

let files;
try {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.chdir(git(['rev-parse', '--show-toplevel']).trim());
  const specs = o.files.map((g) => (g.startsWith(':(') ? g : `:(glob)${g}`));
  files = [...new Set(git(['ls-files', '-z', '-co', '--exclude-standard', '--', ...specs]).split('\0').filter(Boolean))];
} catch (e) { fail(2, `git failed; run this inside a git repository: ${String(e.stderr || e.message).trim()}`); }
if (!files.length) fail(2, `no file matches --files ${o.files.join(' ')} (git globs: *.py is top level only, **/*.py is every folder)`);

const hits = [];
const bad = [];
const allowed = [];
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
      return allowed.push(`${where} until ${m[1]}, approved by ${m[3]}`); // valid: listed, not counted
    }
    if (re.test(line)) hits.push(where);
  });
}

if (allowed.length) {
  console.log(`${o.id}: ${allowed.length} exceptions, not counted; check each approval in review:\n`
    + allowed.map((a) => `  ${a}`).join('\n'));
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
  mkdirSync(dirname(o.baseline), { recursive: true });
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
