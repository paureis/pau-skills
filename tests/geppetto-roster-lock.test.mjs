// The roster lock (docs/backlog/q41.md). CLAUDE.md and geppetto's COVENANT.md say a change to a roster agent raises
// the roster number on every covenant marker. tests/geppetto-roster.test.mjs ties each marker to COVENANT.version, so
// a change that leaves every marker at the old number still passed. LOCK below holds the roster number and a sha256 of
// the roster files; this test fails when the files change and the number does not go up, and each failure says the
// exact line to write.
//
// The hash covers every file under skills/agent-orchestration/geppetto/roster/, found recursively, sorted by its POSIX
// path relative to roster/. Files and folders whose name starts with "." are skipped: untracked junk such as a macOS
// .DS_Store would change the hash here and not in CI. Per file it takes the path, a NUL, the text with CRLF changed to
// LF, one leading byte order mark dropped and the number on each covenant start marker replaced by a fixed token, then
// a NUL. Raising the number alone keeps the hash, so the check does not depend on itself.
// Not covered, and why:
// - .claude/agents/: each copy is byte-identical to its roster file (tests/geppetto-roster.test.mjs).
// - COVENANT.md and PRODUCTION-RULES.md: their blocks are pasted into the roster files, and the existing tests check
//   the pasted blocks equal them, so a change to either block changes a roster file.
// - templates/designer.md: not a roster agent; geppetto's Update step 1 never merges it.
// The bypass: rewriting LOCK with a new hash under the same number passes this test; only a reviewer reading the diff
// catches it.
// The lock line lives here, not in the skill folder: it checks this repository's release habit, the skill never reads
// it, and a standalone geppetto install would ship a file no user needs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { ROSTER, COVENANT, put } from './geppetto.helpers.mjs';

// The lock line: `roster <N> sha256:<64 lowercase hex>`. Change it only as a failure message below says.
const LOCK = 'roster 8 sha256:0ea78d98ad6fe82fe346f6c18335c4af796ad8e10573e4816a4deadd05931d93';

const BOM = '\uFEFF';
const WHERE = 'COVENANT.md, each roster/ file, templates/designer.md, the installed copies in .claude/agents/';
const SHAPE = 'roster <N> sha256:<64 lowercase hex>';
const HERE = 'roster lock (LOCK in tests/geppetto-roster-lock.test.mjs)';
// The start marker as check-agents-checks.mjs matches it, with the g flag so every marker in a file is replaced.
const MARKER = /<!--\s*covenant start: geppetto roster (\d+)\s*-->/g;

/** Every file under `dir`, recursively, skipping dot entries: { <POSIX path relative to dir>: <text> }. */
function readTree(dir, prefix = '') {
  const files = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const key = prefix + e.name;
    if (e.isDirectory()) Object.assign(files, readTree(join(dir, e.name), `${key}/`));
    else files[key] = readFileSync(join(dir, e.name), 'utf8');
  }
  return files;
}

/** sha256 hex over { key: text }, sorted by key: per file the key, a NUL, the normalized text, a NUL. */
function rosterHash(files) {
  const h = createHash('sha256');
  for (const key of Object.keys(files).sort()) {
    let text = files[key].replace(/\r\n/g, '\n');
    if (text.startsWith(BOM)) text = text.slice(1);
    text = text.replace(MARKER, (m, n) => m.replace(n, 'N'));
    h.update(`${key}\0${text}\0`);
  }
  return h.digest('hex');
}

/** Compares the lock line with the roster number and hash: { ok: true }, or { ok: false, message } with the fix. A
 * message that gives a new line ends with it, with no period after it, so it pastes as is. */
function verdict({ line, version, hash }) {
  const fail = (why) => ({ ok: false, message: `${HERE}: ${why}` });
  const m = /^roster (\d+) sha256:([0-9a-f]{64})$/.exec(line);
  if (!m) return fail(`LOCK ${JSON.stringify(line)} does not parse; its shape is "${SHAPE}". If no roster file changed since LOCK was last right, set LOCK to: roster ${version} sha256:${hash}`);
  const locked = Number(m[1]);
  const same = m[2] === hash;
  const raise = (n) => `raise it to ${n} on every covenant marker (${WHERE}), then set LOCK to: roster ${n} sha256:${hash}`;
  if (version === locked) return same ? { ok: true } : fail(`a roster file changed but the roster number is still ${locked}: ${raise(locked + 1)}`);
  if (version > locked) return fail(`the roster number went up from ${locked} to ${version}: set LOCK to: roster ${version} sha256:${hash}`);
  if (same) return fail(`the roster number went down from ${locked} to ${version}: set every covenant marker back to ${locked}; leave LOCK as it is.`);
  return fail(`a roster file changed and the number went down from ${locked} to ${version}: ${raise(locked + 1)}`);
}

// Test data: a 64-character hex string of one character, and a two-file roster at number n.
const H = (c) => c.repeat(64);
const roster = (n) => ({ 'a.md': `body\n<!-- covenant start: geppetto roster ${n} -->\nlaws\n`, 'b.md': 'other\n' });

test('raising the number alone keeps the hash', () => {
  const a = rosterHash(roster(8));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(rosterHash(roster(9)), a);
  const two = (n) => ({ 'a.md': `<!-- covenant start: geppetto roster ${n} -->\nx\n<!--  covenant start: geppetto roster ${n}  -->\n` });
  assert.equal(rosterHash(two(9)), rosterHash(two(8)), 'every marker in a file, not only the first');
});

test('an edit to a roster file changes the hash', () => {
  const a = rosterHash(roster(8));
  assert.notEqual(rosterHash({ ...roster(8), 'b.md': 'other.\n' }), a, 'text');
  assert.notEqual(rosterHash({ ...roster(8), 'c.md': '' }), a, 'a new empty file');
  const { 'b.md': moved, ...rest } = roster(8);
  assert.notEqual(rosterHash({ ...rest, 'sub/b.md': moved }), a, 'a renamed file');
  // Each pair would hash the same bytes without the NULs between key and text and between files.
  assert.notEqual(rosterHash({ a: 'bc' }), rosterHash({ ab: 'c' }), 'text moved into the key');
  assert.notEqual(rosterHash({ 'a.md': 'x', 'b.md': 'y' }), rosterHash({ 'a.md': 'xb.mdy' }), 'a file folded into the one before it');
});

test('line endings, a byte order mark and the order files are read in do not change the hash', () => {
  const a = rosterHash(roster(8));
  const crlf = Object.fromEntries(Object.entries(roster(8)).map(([k, v]) => [k, `${BOM}${v.replace(/\n/g, '\r\n')}`]));
  assert.equal(rosterHash(crlf), a);
  assert.equal(rosterHash(Object.fromEntries(Object.entries(roster(8)).reverse())), a);
});

test('the roster is read recursively, keyed by its POSIX path', () => {
  const dir = tempDir('geppetto-lock-');
  put(dir, 'a.md', 'one\n');
  put(dir, join('sub', 'b.md'), 'two\n');
  assert.deepEqual(readTree(dir), { 'a.md': 'one\n', 'sub/b.md': 'two\n' });
});

test('a .DS_Store or other dot entry next to the roster files leaves the hash unchanged', () => {
  const dir = tempDir('geppetto-lock-dot-');
  put(dir, 'a.md', 'one\n');
  put(dir, join('sub', 'b.md'), 'two\n');
  const before = rosterHash(readTree(dir));
  put(dir, '.DS_Store', 'junk');
  put(dir, join('sub', '.DS_Store'), 'junk');
  put(dir, join('.hidden', 'c.md'), 'three\n');
  assert.equal(rosterHash(readTree(dir)), before);
});

test('a hash and number equal to the line pass', () => {
  assert.deepEqual(verdict({ line: `roster 8 sha256:${H('a')}`, version: 8, hash: H('a') }), { ok: true });
});

test('a changed roster with the same number fails and says to raise it', () => {
  const v = verdict({ line: `roster 8 sha256:${H('a')}`, version: 8, hash: H('b') });
  assert.equal(v.ok, false);
  assert.match(v.message, /a roster file changed but the roster number is still 8/);
  assert.ok(v.message.includes(`raise it to 9 on every covenant marker (${WHERE})`), v.message);
  assert.ok(v.message.endsWith(`then set LOCK to: roster 9 sha256:${H('b')}`), v.message);
});

test('a number higher than the line fails and gives the new line', () => {
  for (const hash of [H('a'), H('b')]) {
    const v = verdict({ line: `roster 8 sha256:${H('a')}`, version: 9, hash });
    assert.equal(v.ok, false);
    assert.ok(v.message.endsWith(`the roster number went up from 8 to 9: set LOCK to: roster 9 sha256:${hash}`), v.message);
  }
});

test('a number lower than the line fails: set the markers back, or raise past the line', () => {
  const back = verdict({ line: `roster 8 sha256:${H('a')}`, version: 7, hash: H('a') });
  assert.equal(back.ok, false);
  assert.ok(back.message.endsWith('the roster number went down from 8 to 7: set every covenant marker back to 8; leave LOCK as it is.'), back.message);
  const past = verdict({ line: `roster 8 sha256:${H('a')}`, version: 7, hash: H('b') });
  assert.equal(past.ok, false);
  assert.ok(past.message.endsWith(`a roster file changed and the number went down from 8 to 7: raise it to 9 on every covenant marker (${WHERE}), then set LOCK to: roster 9 sha256:${H('b')}`), past.message);
});

test('a line that does not parse fails, naming the shape', () => {
  for (const line of ['', 'roster 8', `roster eight sha256:${H('a')}`, `roster 8 sha256:${H('A')}`, `roster 8 sha256:${'a'.repeat(63)}`, `roster 8 sha256:${H('a')} `]) {
    const v = verdict({ line, version: 8, hash: H('c') });
    assert.equal(v.ok, false, JSON.stringify(line));
    assert.ok(v.message.includes('roster <N> sha256:<64 lowercase hex>'), v.message);
    assert.ok(v.message.endsWith(`set LOCK to: roster 8 sha256:${H('c')}`), v.message);
  }
});

test('the roster on this tree matches the lock line', () => {
  const v = verdict({ line: LOCK, version: COVENANT.version, hash: rosterHash(readTree(ROSTER)) });
  if (!v.ok) assert.fail(v.message);
});
