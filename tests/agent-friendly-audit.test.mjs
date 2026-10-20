// The agent-friendly-audit miner: fix and revert commits with the files they touched, the user's own messages from
// one project's Claude Code transcripts, and the transcript folders that belong to a repository. Every git repository
// is built in a temporary folder at test time; the transcript fixture is synthetic.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tempDir } from './helpers.mjs';
import { redact, classify } from '../skills/planning/agent-friendly-audit/mine.mjs';
import { SCRIPT } from './agent-friendly-audit.helpers.mjs';

describe('classify', () => {
  test('a fix, a revert and a fixup are told apart, and a skill named bug-fix is not a fix', () => {
    assert.equal(classify('Fix empty input', ''), 'fix');
    assert.equal(classify('parser: fixes from review', ''), 'fix');
    assert.equal(classify('Hotfix for the login page', ''), 'fix');
    assert.equal(classify('Revert "Add cache"', 'This reverts commit 1234567.'), 'revert');
    assert.equal(classify('Undo the cache', 'This reverts commit 1234567.'), 'revert');
    assert.equal(classify('fixup! Add parser', ''), 'fixup');
    assert.equal(classify('Add bug-fix skill', ''), null);
    assert.equal(classify('Add a prefix helper', ''), null);
    assert.equal(classify('Rename fix-ups folder', ''), null);
    assert.equal(classify('Update the bug-fix skill wording', ''), null);
    // A subject that adds something new names "fix" as a topic, not as a correction.
    assert.equal(classify('Add flaky-test-hunt: find why a test fails, and prove the fix', ''), null);
    assert.equal(classify('Create a fix-it checklist and fix the docs', ''), null);
  });

  test('realistic fix subjects are found, and look-alikes are not', () => {
    const fixes = ['Add fix for crash on startup', 'Added a fix for the race', 'Implement fix for #44', 'Bug-fix: crash on save',
      'hot-fix', 'quick-fix: wrong total', 'Hotfix-1.2.3 login'];
    assert.deepEqual(fixes.filter((s) => classify(s, '') !== 'fix'), []);
    assert.equal(classify('Reverted the cache change', ''), 'revert');
    const not = ['Add prefix option', 'Update the test fixture', 'Rename fix_typo helper', 'Add bug-fix skill'];
    assert.deepEqual(not.filter((s) => classify(s, '') !== null), []);
  });
});

describe('redact', () => {
  test('emails, token shapes, key values and home paths are hidden', () => {
    const home = join('/', 'srv', 'people', 'ana');
    const token = 'gh' + 'p_' + 'A1b2'.repeat(9);
    const text = [
      'mail ana@example.com now',
      `token ${token} here`,
      'password=hunter2hunter2',
      `open ${home}/src/app.py`,
      `and ${join('/', 'home', 'bob')}/notes.txt`,
      `and ${['C:', 'Users', 'carl', 'x.txt'].join('\\')}`,
    ].join('\n');
    const out = redact(text, home);
    assert.doesNotMatch(out, /@/);
    assert.doesNotMatch(out, /A1b2A1b2/);
    assert.doesNotMatch(out, /hunter2/);
    assert.doesNotMatch(out, /ana|bob|carl/);
    assert.match(out, /~\/src\/app\.py/);
    assert.match(out, /~\/notes\.txt/);
    assert.match(out, /password=\[secret\]/);
  });

  // Each secret is built at run time, so no file in the repository holds a secret-shaped string.
  const SECRETS = {
    'GITHUB_TOKEN=': 'abc123' + 'Q'.repeat(20),
    'OPENAI_API_KEY=': 'xyz' + 'W'.repeat(24),
    'DB_PASSWORD=': 'hunter' + '2',
    'AWS_SECRET_ACCESS_KEY=': 'wJalr' + 'X'.repeat(30),
    '{"password": "': 'pw12' + '3456' + '"}',
    'Authorization: Bearer ': 'abcdef' + 'Z'.repeat(20),
    'gitlab ': 'glp' + 'at-' + 'R'.repeat(20),
    'google ': 'AI' + 'za' + 'S'.repeat(35),
    'npm ': 'np' + 'm_' + 'T'.repeat(36),
    'url postgres://app:': 'pw' + 'Secret9' + '@localhost:5432/db',
  };

  for (const [prefix, secret] of Object.entries(SECRETS)) {
    test(`hides the secret in ${JSON.stringify(prefix.trim())}`, () => {
      const value = secret.replace(/["}]+$/, '').replace(/@.*$/, '');
      const out = redact(`${prefix}${secret}`, '/nowhere');
      assert.ok(!out.includes(value), `${out} still shows ${value}`);
      assert.match(out, /\[secret\]/);
    });
  }

  test('secrets are hidden end to end through transcripts', () => {
    const dir = join(tempDir('afa-sec-'), '-s-t');
    mkdirSync(dir);
    const lines = Object.entries(SECRETS).map(([prefix, secret], i) => JSON.stringify(
      { type: 'user', timestamp: `2026-04-02T00:00:0${i}Z`, message: { role: 'user', content: `${prefix}${secret}` } }));
    writeFileSync(join(dir, 's.jsonl'), lines.join('\n') + '\n');
    const r = runNode(SCRIPT, { args: ['transcripts', dir] });
    assert.equal(r.code, 0, r.stderr);
    for (const secret of Object.values(SECRETS)) {
      const value = secret.replace(/["}]+$/, '').replace(/@.*$/, '');
      assert.ok(!r.stdout.includes(value), `transcripts printed ${value}`);
    }
  });

  test('redaction stays fast on long input (no quadratic regular expression)', () => {
    const inputs = ['a'.repeat(200000), 'a.'.repeat(100000), 'x_'.repeat(100000) + '=', ('ab' + '-'.repeat(5)).repeat(30000) + '@'];
    for (const text of inputs) {
      const start = Date.now();
      redact(text, '/nowhere');
      assert.ok(Date.now() - start < 1500, `took ${Date.now() - start} ms on ${text.slice(0, 12)}...`);
    }
  });

  test('a 5 MB message is cut and printed quickly', () => {
    const dir = join(tempDir('afa-big-'), '-b-c');
    mkdirSync(dir);
    // A token longer than the 400 + 2,048 characters read before redaction, then a marker past it. Only a message
    // cut before redaction keeps the marker out: redacting the whole text turns the token into [secret] and the
    // marker then lands inside the first 400 characters.
    const token = 'sk' + '-' + 'q9'.repeat(1500);
    const head = token + ' MARKER ';
    const content = head + 'a'.repeat(5 * 1024 * 1024 - head.length);
    const big = { type: 'user', timestamp: '2026-04-03T00:00:00Z', message: { role: 'user', content } };
    writeFileSync(join(dir, 's.jsonl'), JSON.stringify(big) + '\n');
    const start = Date.now();
    const r = runNode(SCRIPT, { args: ['transcripts', dir] });
    const took = Date.now() - start;
    assert.equal(r.code, 0, r.stderr);
    const row = r.stdout.split('\n').find((l) => l.startsWith('1\t'));
    assert.match(row, /\[secret\]/);
    assert.doesNotMatch(row, /MARKER/);
    assert.ok(row.length < 450);
    assert.ok(took < 5000, `took ${took} ms`);

    // Plain text with no secret: redaction leaves it long, so only the cut after redaction keeps the row short.
    const plainDir = join(tempDir('afa-big-'), '-b-d');
    mkdirSync(plainDir);
    const plain = { type: 'user', timestamp: '2026-04-03T00:00:00Z', message: { role: 'user', content: 'a'.repeat(5 * 1024 * 1024) } };
    writeFileSync(join(plainDir, 's.jsonl'), JSON.stringify(plain) + '\n');
    const plainStart = Date.now();
    const p = runNode(SCRIPT, { args: ['transcripts', plainDir] });
    const plainTook = Date.now() - plainStart;
    assert.equal(p.code, 0, p.stderr);
    assert.ok(p.stdout.split('\n').find((l) => l.startsWith('1\t')).length < 450);
    assert.ok(plainTook < 5000, `took ${plainTook} ms`);
  });
});
