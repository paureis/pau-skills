// The roster lock against a base commit (docs/backlog/q43.md). tests/geppetto-roster-lock.test.mjs fails a roster
// change that leaves the roster number alone, but a change that also rewrites LOCK with the new hash under the same
// number passes it. This check reads LOCK at a base commit and fails when the hash changed and the number did not go
// up, or when the number went down with the same hash.
//
// The base: ROSTER_LOCK_BASE when it is set and not empty (CI sets it: HEAD^1 on a pull request, the previous main on a
// push), else the merge base of HEAD and refs/remotes/origin/main. It never fetches. With no base (no origin/main, a
// value that does not resolve, no lock file or no valid LOCK at the base, git cannot run) the check passes with a
// note: there is nothing to compare against. The lock file is read as text, never imported, so its tests run once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT } from './helpers.mjs';
import { runGit } from '../hooks/guards/file-size-guard.mjs';
import { makeRepo, cleanEnv, plainDir } from './file-size-guard.helpers.mjs';

const LOCK_FILE = 'tests/geppetto-roster-lock.test.mjs';
const SHAPE = 'roster <N> sha256:<64 lowercase hex>';
// 30 seconds, not runGit's 2: a slow macOS runner can time out, and a timeout is a no-base pass.
const TIMEOUT = 30000;
const HERE = 'roster lock base check (tests/geppetto-roster-lock-base.test.mjs)';

/** The LOCK in a lock file's text: { number, hash, line } with `line` the whole source line, or { reason }. */
function parseLock(text) {
  const found = [...String(text).replace(/\r\n/g, '\n').matchAll(/^const LOCK = '([^'\n]*)';$/gm)];
  if (found.length === 0) return { reason: 'no LOCK line' };
  if (found.length > 1) return { reason: `${found.length} LOCK lines, not one` };
  const m = /^roster (\d+) sha256:([0-9a-f]{64})$/.exec(found[0][1]);
  if (!m) return { reason: `LOCK ${JSON.stringify(found[0][1])} does not have the shape "${SHAPE}"` };
  return { number: Number(m[1]), hash: m[2], line: found[0][0] };
}

/** The base LOCK against the LOCK here: { ok: true }, or { ok: false, message } with the fix. */
function rule(base, here, short) {
  if (here.number > base.number) return { ok: true };
  const lines = `base: ${base.line}\n  here: ${here.line}`;
  const then = `${LOCK_FILE} then gives the LOCK line to set.`;
  if (here.hash !== base.hash) {
    return { ok: false, message: `${HERE}: the LOCK hash changed since base commit ${short} but the roster number did not go up.\n  ${lines}\nRaise the roster number to ${base.number + 1} on every covenant marker; ${then}` };
  }
  if (here.number < base.number) {
    return { ok: false, message: `${HERE}: the roster number went down from ${base.number} to ${here.number} since base commit ${short}, with the same hash.\n  ${lines}\nSet every covenant marker back to ${base.number}; ${then}` };
  }
  return { ok: true };
}

/** The base LOCK: { base, short, chosen }, or { note } saying why there is none. Never throws. */
function findBase({ root, env }) {
  const git = (...args) => runGit(args, root, env, TIMEOUT);
  const none = (r, why) => ({ note: `${HERE}: no base commit, so the check passes: ${r.status === null ? 'git cannot run (or timed out)' : why}. Set ROSTER_LOCK_BASE to a commit to turn the check on.` });
  let ref = env.ROSTER_LOCK_BASE;
  let chosen = `ROSTER_LOCK_BASE ${JSON.stringify(ref)}`;
  if (typeof ref !== 'string' || ref === '') {
    // The full ref, so a local branch named origin/main cannot stand in for it.
    const origin = git('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main^{commit}');
    if (origin.status !== 0) return none(origin, 'ROSTER_LOCK_BASE is unset and there is no origin/main');
    const mb = git('merge-base', 'HEAD', 'refs/remotes/origin/main');
    if (mb.status !== 0) return none(mb, 'HEAD has no merge base with origin/main');
    ref = mb.stdout.trim();
    chosen = 'the merge base of HEAD and origin/main';
  }
  if (ref.startsWith('-')) return none({}, `${chosen} starts with "-", so it is not a commit`);
  const resolved = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  if (resolved.status !== 0) return none(resolved, `${chosen} does not resolve to a commit`);
  const sha = resolved.stdout.trim();
  const short = sha.slice(0, 12);
  const shown = git('show', `${sha}:${LOCK_FILE}`);
  if (shown.status !== 0) return none(shown, `${LOCK_FILE} is not in base commit ${short}`);
  const base = parseLock(shown.stdout);
  if (base.reason) return none({}, `${LOCK_FILE} at base commit ${short}: ${base.reason}`);
  return { base, short, chosen };
}

/** The check on the tree at `root`: { ok, message, diagnostic }, where `diagnostic` names the base or why there is none. */
function checkLock({ root, env }) {
  const found = findBase({ root, env });
  if (found.note) return { ok: true, diagnostic: found.note };
  const diagnostic = `${HERE}: base: ${found.chosen}, commit ${found.short}`;
  let text;
  try { text = readFileSync(join(root, LOCK_FILE), 'utf8'); } catch {
    return { ok: false, diagnostic, message: `${HERE}: ${LOCK_FILE} is missing in the working tree.` };
  }
  const here = parseLock(text);
  if (here.reason) return { ok: false, diagnostic, message: `${HERE}: ${LOCK_FILE} in the working tree: ${here.reason}.` };
  return { ...rule(found.base, here, found.short), diagnostic };
}

// Test data: a 64-character hex string of one character, and a lock file whose LOCK is `roster <n> sha256:<hash>`.
const H = (c) => c.repeat(64);
const lockLine = (n, c) => `const LOCK = 'roster ${n} sha256:${H(c)}';`;
const lockText = (line) => `// header\nimport x from 'y';\n\n${line}\n\nconst OTHER = 'z';\n`;

test('parseLock reads one valid LOCK line', () => {
  assert.deepEqual(parseLock(lockText(lockLine(8, 'a'))), { number: 8, hash: H('a'), line: lockLine(8, 'a') });
});

test('parseLock rejects text with no LOCK line', () => {
  const r = parseLock('const OTHER = 1;\n  const LOCK = \'x\';\n');
  assert.equal(r.number, undefined);
  assert.match(r.reason, /no LOCK line/);
});

test('parseLock rejects two LOCK lines', () => {
  const r = parseLock(lockText(`${lockLine(8, 'a')}\n${lockLine(9, 'b')}`));
  assert.equal(r.number, undefined);
  assert.match(r.reason, /2 LOCK lines/);
});

test('parseLock rejects a LOCK value of the wrong shape', () => {
  for (const value of ['roster 8', `roster eight sha256:${H('a')}`, `roster 8 sha256:${H('A')}`, `roster 8 sha256:${'a'.repeat(63)}`, `roster 8 sha256:${H('a')} `]) {
    const r = parseLock(lockText(`const LOCK = '${value}';`));
    assert.equal(r.number, undefined, value);
    assert.ok(r.reason.includes(JSON.stringify(value)), r.reason);
    assert.ok(r.reason.includes('roster <N> sha256:<64 lowercase hex>'), r.reason);
  }
});

test('parseLock reads a file with CRLF line endings', () => {
  // A safeguard: the m flag already ends a line at \r, so removing the CRLF replace does not fail this test.
  assert.deepEqual(parseLock(lockText(lockLine(8, 'a')).replace(/\n/g, '\r\n')), { number: 8, hash: H('a'), line: lockLine(8, 'a') });
});

const lock = (n, c) => ({ number: n, hash: H(c), line: lockLine(n, c) });

test('rule: the same number and hash pass', () => {
  assert.deepEqual(rule(lock(8, 'a'), lock(8, 'a'), 'abc1234'), { ok: true });
});

test('rule: a higher number passes, whatever the hash', () => {
  assert.deepEqual(rule(lock(8, 'a'), lock(9, 'a'), 'abc1234'), { ok: true });
  assert.deepEqual(rule(lock(8, 'a'), lock(9, 'b'), 'abc1234'), { ok: true });
  assert.deepEqual(rule(lock(8, 'a'), lock(12, 'b'), 'abc1234'), { ok: true });
});

test('rule: a changed hash under the same or a lower number fails and says to raise it', () => {
  for (const n of [8, 7]) {
    const r = rule(lock(8, 'a'), lock(n, 'b'), 'abc1234');
    assert.equal(r.ok, false, String(n));
    assert.ok(r.message.includes('base commit abc1234'), r.message);
    assert.ok(r.message.includes(`base: ${lockLine(8, 'a')}`), r.message);
    assert.ok(r.message.includes(`here: ${lockLine(n, 'b')}`), r.message);
    assert.ok(r.message.includes('Raise the roster number to 9 on every covenant marker; tests/geppetto-roster-lock.test.mjs then gives the LOCK line to set'), r.message);
  }
});

test('rule: the same hash under a lower number fails and says to set the markers back', () => {
  const r = rule(lock(8, 'a'), lock(7, 'a'), 'abc1234');
  assert.equal(r.ok, false);
  assert.ok(r.message.includes('base commit abc1234'), r.message);
  assert.ok(r.message.includes(`base: ${lockLine(8, 'a')}`), r.message);
  assert.ok(r.message.includes(`here: ${lockLine(7, 'a')}`), r.message);
  assert.ok(r.message.includes('Set every covenant marker back to 8; tests/geppetto-roster-lock.test.mjs then gives the LOCK line to set.'), r.message);
});

// Temporary repositories. Git runs with a fixed identity and a clean environment, and checkLock gets an explicit env
// without the ROSTER_LOCK_BASE that CI sets, so the outer run never leaks in.
const ID = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...args) => execFileSync('git', [...ID, ...args], { cwd, encoding: 'utf8', env: cleanEnv() }).trim();
const envOf = (extra = {}) => {
  const { ROSTER_LOCK_BASE, ...rest } = cleanEnv();
  return { ...rest, ...extra };
};
const putLock = (dir, text) => {
  mkdirSync(dirname(join(dir, LOCK_FILE)), { recursive: true });
  writeFileSync(join(dir, LOCK_FILE), text);
};
const commitAll = (dir, msg) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', msg); return git(dir, 'rev-parse', 'HEAD'); };
/** A repository whose one commit holds a lock file with LOCK at roster 8, hash of 'a'. */
function baseRepo() {
  const dir = makeRepo();
  putLock(dir, lockText(lockLine(8, 'a')));
  return { dir, sha: commitAll(dir, 'base') };
}
const NOTE = 'Set ROSTER_LOCK_BASE to a commit to turn the check on.';
/** checkLock in a case with no base: it passes and the note says why. */
function noBase(root, env, why) {
  const r = checkLock({ root, env });
  assert.equal(r.ok, true, r.message);
  assert.ok(r.diagnostic.includes(why), r.diagnostic);
  assert.ok(r.diagnostic.includes(NOTE), r.diagnostic);
  return r;
}

test('a base with LOCK: a same-number rewrite here fails, and a raised number passes', () => {
  const { dir, sha } = baseRepo();
  const env = envOf({ ROSTER_LOCK_BASE: 'HEAD' });
  assert.equal(checkLock({ root: dir, env }).ok, true, 'unchanged');
  putLock(dir, lockText(lockLine(8, 'b')));
  const r = checkLock({ root: dir, env });
  assert.equal(r.ok, false);
  assert.ok(r.message.includes(`base commit ${sha.slice(0, 12)}`), r.message);
  assert.ok(r.message.includes(`here: ${lockLine(8, 'b')}`), r.message);
  assert.ok(r.diagnostic.includes(`ROSTER_LOCK_BASE "HEAD", commit ${sha.slice(0, 12)}`), r.diagnostic);
  putLock(dir, lockText(lockLine(9, 'b')));
  assert.equal(checkLock({ root: dir, env }).ok, true, 'raised');
});

test('no base: the lock file is missing at the base', () => {
  const dir = makeRepo();
  writeFileSync(join(dir, 'other.txt'), 'x\n');
  commitAll(dir, 'no lock');
  putLock(dir, lockText(lockLine(8, 'a')));
  noBase(dir, envOf({ ROSTER_LOCK_BASE: 'HEAD' }), `${LOCK_FILE} is not in`);
});

test('no base: LOCK is missing, repeated or unparsable at the base', () => {
  for (const [text, why] of [['const OTHER = 1;\n', 'no LOCK line'], [lockText(`${lockLine(8, 'a')}\n${lockLine(8, 'a')}`), '2 LOCK lines'], [lockText("const LOCK = 'roster 8';"), 'does not have the shape']]) {
    const dir = makeRepo();
    putLock(dir, text);
    commitAll(dir, 'bad lock');
    putLock(dir, lockText(lockLine(8, 'b')));
    noBase(dir, envOf({ ROSTER_LOCK_BASE: 'HEAD' }), why);
  }
});

test('no base: an unknown sha, HEAD^1 in a one-commit repository, or a value starting with "-"', () => {
  const { dir } = baseRepo();
  putLock(dir, lockText(lockLine(8, 'b')));
  noBase(dir, envOf({ ROSTER_LOCK_BASE: H('0').slice(0, 40) }), 'does not resolve to a commit');
  noBase(dir, envOf({ ROSTER_LOCK_BASE: 'HEAD^1' }), '"HEAD^1" does not resolve to a commit');
  noBase(dir, envOf({ ROSTER_LOCK_BASE: '--all' }), '"--all" starts with "-"');
});

test('no base: no variable and no origin/main, in a repository or in a folder that is not one', () => {
  const { dir } = baseRepo();
  putLock(dir, lockText(lockLine(8, 'b')));
  noBase(dir, envOf(), 'ROSTER_LOCK_BASE is unset and there is no origin/main');
  const plain = plainDir();
  putLock(plain.dir, lockText(lockLine(8, 'b')));
  noBase(plain.dir, envOf(plain.env), 'ROSTER_LOCK_BASE is unset and there is no origin/main');
});

test('no base: origin/main has no merge base with HEAD', () => {
  const { dir } = baseRepo();
  const orphan = git(dir, 'commit-tree', 'HEAD^{tree}', '-m', 'orphan');
  git(dir, 'update-ref', 'refs/remotes/origin/main', orphan);
  putLock(dir, lockText(lockLine(8, 'b')));
  noBase(dir, envOf(), 'HEAD has no merge base with origin/main');
});

test('no base: git cannot run', () => {
  const { dir } = baseRepo();
  noBase(dir, { PATH: '/nonexistent' }, 'git cannot run');
  noBase(dir, { PATH: '/nonexistent', ROSTER_LOCK_BASE: 'HEAD' }, 'git cannot run');
});

test('with no variable, or an empty one, the merge base with origin/main is the base', () => {
  const { dir, sha } = baseRepo();
  git(dir, 'update-ref', 'refs/remotes/origin/main', sha);
  writeFileSync(join(dir, 'later.txt'), 'x\n');
  commitAll(dir, 'later');
  putLock(dir, lockText(lockLine(8, 'b')));
  for (const env of [envOf(), envOf({ ROSTER_LOCK_BASE: '' })]) {
    const r = checkLock({ root: dir, env });
    assert.equal(r.ok, false, 'a same-number rewrite against the merge base');
    assert.ok(r.message.includes(`base commit ${sha.slice(0, 12)}`), r.message);
    assert.ok(r.diagnostic.includes(`the merge base of HEAD and origin/main, commit ${sha.slice(0, 12)}`), r.diagnostic);
  }
});

test('the lock file missing here, or a LOCK here that does not parse, fails and says so', () => {
  const { dir } = baseRepo();
  const env = envOf({ ROSTER_LOCK_BASE: 'HEAD' });
  rmSync(join(dir, LOCK_FILE));
  const gone = checkLock({ root: dir, env });
  assert.equal(gone.ok, false);
  assert.ok(gone.message.includes(`${LOCK_FILE} is missing in the working tree`), gone.message);
  putLock(dir, 'no lock here\n');
  const bad = checkLock({ root: dir, env });
  assert.equal(bad.ok, false);
  assert.ok(bad.message.includes(`${LOCK_FILE} in the working tree: no LOCK line`), bad.message);
});

test('the roster lock on this tree did not change its hash without raising the number', (t) => {
  const r = checkLock({ root: ROOT, env: process.env });
  t.diagnostic(r.diagnostic);
  if (!r.ok) assert.fail(r.message);
});
