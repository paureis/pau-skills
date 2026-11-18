// review-scope reads the rules from the merge base: a change is judged by the rules it started from, never by the
// rules it brings, and a change that edits the rules is flagged RULES. Every CLI call runs in a child process with a
// kill timeout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { g, put, commit, run, setup, repoWith, json } from './review-scope.helpers.mjs';
import { CONFIG_FILE } from '../skills/verification/review-triage/review-scope.mjs';

const entry = (trigger, check, why = 'PR 1.') => ({ trigger, check, why });
const rules = (o) => JSON.stringify(o);
const rulesFlag = (j) => j.flags.find((f) => f.id === 'RULES');
const CHANGE_MESSAGE = 'the change edits what judges it. The rules shown come from the merge base, and these edits are part of the change under review.';
const FIX_MESSAGE = 'the fix edits what judges it. Revert it unless a finding asked for it, and say so.';

test('change and fix judge by the rules at the merge base: a riskyPaths value or checklist entry the change adds does not apply', () => {
  const { dir, reviewed } = setup({ riskyPaths: ['core/**'], checklist: [entry({ paths: ['src/**'] }, 'base entry')] });
  const mb = g(dir, 'rev-parse', 'main');
  put(dir, CONFIG_FILE, rules({ riskyPaths: ['src/**'], checklist: [entry({ paths: ['src/**'] }, 'change entry')] }));
  put(dir, 'src/msg.py', 'MSG = "fixed"\n');
  put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert MSG\n');
  const c = json(run(dir, ['change', '--json']));
  assert.deepEqual(c.rules, { commit: mb, file: CONFIG_FILE });
  assert.deepEqual(c.summary.risky, []);
  assert.deepEqual(c.checklist.triggered.map((t) => t.check), ['base entry']);
  const text = run(dir, ['change']);
  assert.equal(text.code, 0, text.stderr);
  assert.equal(text.stdout.split('\n')[1], `Rules: ${CONFIG_FILE} at ${mb.slice(0, 12)}`);
  const f = json(run(dir, ['fix', '--since', reviewed, '--json']));
  assert.deepEqual(f.rules, { commit: mb, file: CONFIG_FILE });
  assert.deepEqual(f.flags.map((x) => x.id), ['OUTSIDE', 'RULES']);
  assert.deepEqual(f.checklist.triggered.map((t) => t.check), ['base entry']);
  assert.equal(run(dir, ['fix', '--since', reviewed]).stdout.split('\n')[1], `Rules: ${CONFIG_FILE} at ${mb.slice(0, 12)}`);
});

test('a change that adds the rules file is judged by the defaults and flagged RULES', () => {
  const { dir, base } = repoWith({ 'src/msg.py': 'MSG = "ok"\n' });
  put(dir, CONFIG_FILE, rules({ riskyPaths: ['src/**'] }));
  put(dir, 'src/msg.py', 'MSG = "done"\n');
  commit(dir, 'rules');
  const r = run(dir, ['change']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.split('\n')[1], `Rules: the defaults (no ${CONFIG_FILE} at ${base.slice(0, 12)})`);
  const j = json(run(dir, ['change', '--json']));
  assert.deepEqual(j.rules, { commit: base, file: null });
  assert.deepEqual(j.summary.risky, []);
  assert.deepEqual(j.flags, [{ id: 'RULES', paths: [CONFIG_FILE], reasons: ['(the review rules)'], message: CHANGE_MESSAGE }]);
});

test('a change that edits the rules file: change exits 0 with the RULES flag, a fix exits 1 with RULES after the other flags', () => {
  const { dir, reviewed } = setup();
  put(dir, CONFIG_FILE, rules({ riskyPaths: [] }));
  const c = run(dir, ['change']);
  assert.equal(c.code, 0, c.stderr);
  assert.match(c.stdout, new RegExp(`\\n {2}tests/test_msg\\.py [^\\n]*\\nFlags:\\n {2}RULES: \\.claude/review-rules\\.json \\(the review rules\\): ${CHANGE_MESSAGE.replace(/\./g, '\\.')}\\nRisky files: `));
  assert.deepEqual(rulesFlag(json(run(dir, ['change', '--json']))).reasons, ['(the review rules)']);
  const f = run(dir, ['fix', '--since', reviewed]);
  assert.equal(f.code, 1, f.stderr);
  assert.match(f.stdout, new RegExp(`\\n {2}OUTSIDE: [^\\n]*\\n {2}RULES: \\.claude/review-rules\\.json \\(the review rules\\): ${FIX_MESSAGE.replace(/\./g, '\\.')}\\n`));
  assert.deepEqual(json(run(dir, ['fix', '--since', reviewed, '--json'])).flags.map((x) => x.id), ['NO_TEST', 'OUTSIDE', 'RULES']);
});

test('an invalid rules file at the merge base stops change and fix with exit 2, naming the file and the commit', () => {
  const bad = setup({ riskyPath: [] });
  const json1 = repoWith({ [CONFIG_FILE]: '{"riskyPaths": [' });
  put(json1.dir, 'src/x.py', 'x = 1\n');
  commit(json1.dir, 'work');
  for (const [{ dir }, want] of [[bad, /unknown key "riskyPath"/], [json1, /not valid JSON/]]) {
    const sha12 = g(dir, 'rev-parse', 'main').slice(0, 12);
    for (const args of [['change'], ['fix', '--since', 'HEAD']]) {
      const r = run(dir, args);
      assert.equal(r.code, 2, `${args.join(' ')}: ${r.stdout}`);
      assert.ok(r.stderr.startsWith(`${CONFIG_FILE} at ${sha12}: `), r.stderr);
      assert.match(r.stderr, want);
    }
  }
});

test('an invalid rules file only in the working tree: change exits 0 and fix exits 1, both with RULES', () => {
  const { dir } = setup();
  put(dir, CONFIG_FILE, '{"riskyPath": []}');
  const c = run(dir, ['change', '--json']);
  assert.equal(c.code, 0, c.stderr);
  assert.deepEqual(rulesFlag(json(c)).paths, [CONFIG_FILE]);
  const f = run(dir, ['fix', '--since', 'HEAD', '--json']);
  assert.equal(f.code, 1, f.stderr);
  assert.deepEqual(rulesFlag(json(f)), { id: 'RULES', paths: [CONFIG_FILE], reasons: ['(the review rules)'], message: FIX_MESSAGE });
});

test('a local replace object for the base rules blob is ignored: the rules and the diff come from the real objects', () => {
  const { dir } = setup({ riskyPaths: ['core/**'] });
  put(dir, CONFIG_FILE, rules({}));
  put(dir, 'core/pick.py', 'def pick():\n    return 2\n');
  g(dir, 'replace', g(dir, 'rev-parse', `main:${CONFIG_FILE}`), g(dir, 'hash-object', '-w', CONFIG_FILE));
  const j = json(run(dir, ['change', '--json', '--base', 'main']));
  assert.deepEqual(j.summary.risky, ['core/pick.py']);
  assert.deepEqual(rulesFlag(j).paths, [CONFIG_FILE]);
});

test('a rules file that is a symlink or a folder at the merge base stops change with exit 2: commit the file itself', () => {
  const cases = [
    ['a symlink', (dir) => { put(dir, '.claude/real.json', '{}'); symlinkSync('real.json', join(dir, CONFIG_FILE)); }],
    ['a folder', (dir) => put(dir, `${CONFIG_FILE}/x.json`, '{}')],
  ];
  for (const [kind, make] of cases) {
    const { dir } = repoWith({ 'src/x.py': 'x = 1\n' });
    g(dir, 'switch', '-q', 'main');
    make(dir);
    const base = commit(dir, 'rules');
    g(dir, 'switch', '-q', '-C', 'feature');
    put(dir, 'src/x.py', 'x = 2\n');
    const r = run(dir, ['change']);
    assert.equal(r.code, 2, r.stdout);
    assert.equal(r.stderr.trim(), `${CONFIG_FILE} at ${base.slice(0, 12)}: is ${kind}; commit the file itself`);
  }
});

test('a byte order mark in the merge base\'s rules file is read', () => {
  const { dir, base } = repoWith({ [CONFIG_FILE]: '\uFEFF' + rules({ riskyPaths: ['core/**'] }), 'core/pick.py': 'x = 1\n' });
  put(dir, 'core/pick.py', 'x = 2\n');
  const j = json(run(dir, ['change', '--json']));
  assert.deepEqual(j.rules, { commit: base, file: CONFIG_FILE });
  assert.deepEqual(j.summary.risky, ['core/pick.py']);
});
