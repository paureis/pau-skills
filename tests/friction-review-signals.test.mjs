// friction-review's friction.mjs: each signal of the session part counts what it should, on synthetic sessions in the
// shape Claude Code writes, with a control case next to each count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { step, bash, world, linesOf } from './friction-review.helpers.mjs';
import { extractActions } from '../skills/session-discipline/friction-review/skill-eval-core.mjs';

const NPM_TEST = 'cd /x && npm test 2>&1 | tail -5';
const edit = (f = '/x/a.js') => step('Edit', { file_path: f, old_string: 'a', new_string: 'b' });
const read = (f, extra = {}) => step('Read', { file_path: f, ...extra }, 'line 1');

function sessions() {
  const w = world();
  w.file('package.json', JSON.stringify({ scripts: { test: 'node --test', typecheck: 'tsc', build: 'tsc -b' } }));
  w.file('Makefile', 'lint:\n\techo lint\n');
  w.file('.github/workflows/ci.yml', 'jobs:\n  test:\n    steps:\n      - run: npm ci && npm test\n');
  w.session(w.own, 's1', [
    step('Grep', { pattern: 'foo', path: 'src' }, 'No matches found'),
    step('Glob', { pattern: '**/*.x' }, 'No files found'),
    bash('cd /x && rg foo', '(Bash completed with no output)'),
    bash('ls src', 'a.js\nb.js'),
    read('/x/a.js'), read('/x/a.js'), read('/x/a.js'),
    bash(NPM_TEST, 'Exit code 1\nnot ok 1 - parses', { isError: true }),
    bash(NPM_TEST, 'ok 1'),
    bash('cd /x  &&  npm test 2>&1 | tail -5', 'ok 1'),
    edit(),
    step('Grep', { pattern: 'after' }, 'No matches found'),
  ], { ageMin: 300, subagents: [{ name: 'nometa', agentType: null, steps: [bash('foo --bar', 'Exit code 127\n/bin/sh: foo: command not found', { isError: true })] }] });
  w.session(w.own, 's2', [
    bash('make lint', 'ok'), bash('make lint', 'ok'), edit(), bash('make lint', 'ok'),
    bash('npm run test', 'ok'),
    bash('uv run pytest -q', 'ok'), bash('python -m pytest', 'ok'), bash('rg foo | wc -l', '0'),
  ], { ageMin: 200 });
  w.session(w.own, 's3', [
    step('Write', { file_path: '/x/new.js', content: 'x' }),
    read('/x/b.js'), read('/x/b.js'), read('/x/b.js', { offset: 10, limit: 5 }),
    step('Read', { file_path: '/x/big.txt' }, '<persisted-output>\nOutput too large (61.6KB). Full output saved to: /x/out.txt\n</persisted-output>', { persisted: 63126 }),
    bash('cat big.log', 'y'.repeat(25000)),
    bash('cat small.log', 'y'.repeat(19000)),
    bash('ls /nope', "Exit code 2\nls: cannot access '/nope': No such file or directory", { isError: true }),
    bash('curl https://example.org', 'Exit code 6\ncurl: (6) Could not resolve host: example.org', { isError: true }),
    step('WebFetch', { url: 'https://example.org/a', prompt: 'p' }, 'Request failed with status code 403', { isError: true }),
    bash('rm -rf build', 'This agent is isolated in the worktree /x, but this command is too complex to verify. Refusing to run it.', { isError: true }),
    edit('/x/c.js'),
    bash('node t.js', 'Exit code 1\nTypeError: boom\n    at x (t.js:1:1)', { isError: true }),
  ], { ageMin: 100, subagents: [{ name: 'rev', agentType: 'reviewer', steps: [step('Grep', { pattern: 'SUBMARK' }, 'x.js'), edit('/x/d.js')] }] });
  return w;
}

const run = () => {
  const w = sessions();
  const r = w.run();
  assert.equal(r.code, 0, r.stderr);
  return r.stdout;
};

test('navigation: searches before the first edit, searches that found nothing, repeated reads', () => {
  const out = run();
  assert.deepEqual(linesOf(out, 'searches before the first edit, in transcripts that edit: '), ['5 in 2 of 3 sessions']);
  // s1: Grep, Glob, rg and the Grep after the edit; s2: rg piped to wc -l that printed 0.
  assert.deepEqual(linesOf(out, 'searches that found nothing: '), ['5 in 2 of 3 sessions']);
  // s1 reads a.js three times; s3 reads b.js twice and then another range of it, which is not a repeat.
  assert.deepEqual(linesOf(out, 'same file and range read 3 or more times in one transcript: '), ['1 in 1 of 3 sessions']);
});

test('automated checks: runs and failed runs of each check, sessions with no check, checks never run, unwired checks', () => {
  const out = run();
  assert.deepEqual(linesOf(out, 'runs of npm test: '), ['4 in 2 of 3 sessions; failed: at least 1 (a lower bound: only is_error counts, and a pipe hides the exit code)']);
  assert.deepEqual(linesOf(out, 'runs of make lint: '), ['3 in 1 of 3 sessions; failed: at least 0 (a lower bound: only is_error counts, and a pipe hides the exit code)']);
  assert.match(out, /^runs of npm run typecheck: 0 in 0 of 3 sessions;/m);
  assert.deepEqual(linesOf(out, 'sessions that edited and ran no check: '), ['1 in 1 of 3 sessions']);
  assert.match(out, /^ {2}~-src-app\/s3\.jsonl:\d+ Write \/x\/new\.js$/m);
  assert.deepEqual(linesOf(out, 'checks no session ran: '), ['npm run typecheck']);
  // The workflow names npm test; nothing names make lint or the typecheck script.
  assert.deepEqual(linesOf(out, 'unwired checks (no CI file, pre-commit config or Claude Code hook names them): '), ['npm run typecheck, make lint']);
  assert.match(out, /^check: npm test \(package\.json\), named by: CI$/m);
  assert.match(out, /^check: make lint \(Makefile\), named by: nothing \(unwired check\)$/m);
  assert.doesNotMatch(out, /npm run build/);
});

test('python runners count as the command they run', () => {
  const w = sessions();
  w.file('pytest.ini', '[pytest]\n');
  const r = w.run();
  assert.deepEqual(linesOf(r.stdout, 'runs of pytest: '), ['2 in 1 of 3 sessions; failed: at least 0 (a lower bound: only is_error counts, and a pipe hides the exit code)']);
});

test('tool economy: big results, a command repeated with no edit between (an edit resets it), failures per tool, calls', () => {
  const out = run();
  assert.deepEqual(linesOf(out, 'results over 20000 characters: '), ['2 in 1 of 3 sessions']);
  // The size of a saved result comes from toolUseResult.persistedOutputSize, not from its short stub.
  assert.match(out, /^ {2}~-src-app\/s3\.jsonl:\d+ Read \/x\/big\.txt \(63126 characters\)$/m);
  assert.match(out, /^ {2}~-src-app\/s3\.jsonl:\d+ Bash cat big\.log \(25000 characters\)$/m);
  assert.doesNotMatch(out, /cat small\.log/);
  // s1 runs the npm test line three times (spaces collapsed); s2 runs make lint twice, edits, then once more.
  assert.deepEqual(linesOf(out, 'same command 3 or more times with no edit between: '), ['1 in 1 of 3 sessions']);
  assert.deepEqual(linesOf(out, 'failed calls per tool: '), ['Bash 6, WebFetch 1']);
  assert.deepEqual(linesOf(out, 'calls per session: '), ['median 13, maximum 15 (~-src-app/s3.jsonl)']);
});

test('information access: failed calls by class, with the failure line or only the class for a refusal', () => {
  const out = run();
  assert.deepEqual(linesOf(out, 'failed calls, not found: '), ['2 in 2 of 3 sessions']);
  assert.deepEqual(linesOf(out, 'failed calls, refused: '), ['1 in 1 of 3 sessions']);
  assert.deepEqual(linesOf(out, 'failed calls, network: '), ['2 in 1 of 3 sessions']);
  assert.deepEqual(linesOf(out, 'failed calls, other: '), ['2 in 2 of 3 sessions']);
  assert.match(out, /^ {2}~-src-app\/s3\.jsonl:\d+ Bash ls \/nope failed: ls: cannot access '\/nope': No such file or directory$/m);
  assert.match(out, /^ {2}~-src-app\/s3\.jsonl:\d+ Bash node t\.js failed: TypeError: boom$/m);
  assert.match(out, /^ {2}~-src-app\/s3\.jsonl:\d+ Bash rm -rf build refused$/m);
  assert.doesNotMatch(out, /isolated|Refusing/);
});

test('steps from a subagent file carry its agent type, or unknown with no meta file', () => {
  const out = run();
  assert.match(out, /^ {2}~-src-app\/s3\/subagents\/agent-rev\.jsonl:\d+ Grep SUBMARK \(subagent: reviewer\)$/m);
  assert.match(out, /^ {2}~-src-app\/s1\/subagents\/agent-nometa\.jsonl:\d+ Bash foo --bar failed: \/bin\/sh: foo: command not found \(subagent: unknown\)$/m);
  assert.match(out, /^ {2}~-src-app\/s1\.jsonl:\d+ Grep foo in src$/m);
  assert.match(out, /^# friction-review: 3 sessions .*; 2 subagent transcripts; 3 unreadable lines;/m);
});

test('sidechain lines in a main file (older versions) count as subagent steps', () => {
  const w = world();
  w.session(w.own, 'old', [bash('ls', 'a'), bash('npx nope', 'Exit code 127\nnope: command not found', { isError: true, sidechain: true })]);
  const r = w.run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^ {2}~-src-app\/old\.jsonl:\d+ Bash npx nope failed: nope: command not found \(subagent: unknown\)$/m);
});

test('extractActions reads the steps of a session file as Claude Code writes it', () => {
  const w = world();
  const file = w.session(w.own, 'shape', [step('Grep', { pattern: 'p' }, 'No matches found'), bash('false', 'Exit code 1', { isError: true }), edit()]);
  const x = extractActions(readFileSync(file, 'utf8'));
  assert.equal(x.model, 'some-model');
  assert.equal(x.badLines, 1);
  assert.deepEqual(x.steps.map((s) => [s.tool, s.target, s.failed]), [['Grep', 'p', null], ['Bash', 'false', 'Exit code 1'], ['Edit', '/x/a.js', null]]);
});
