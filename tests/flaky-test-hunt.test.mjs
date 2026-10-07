// repeat.mjs for the flaky-test-hunt skill: argument parsing, the Wilson interval and run-count rule, signature
// normalization (what must merge and what must stay apart), the summary, and end-to-end counting against a small
// node command that fails on a known, deterministic pattern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plugin, runNode, tempDir } from './helpers.mjs';
import { parseArgs, wilson, runsNeeded, normalizeSignature, signatureId, summarize, repeat } from '../plugins/verification/skills/flaky-test-hunt/repeat.mjs';

const SCRIPT = plugin('verification', 'skills', 'flaky-test-hunt', 'repeat.mjs');
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

test('parseArgs: defaults, options, and the command after --', () => {
  const { opts } = parseArgs(['--', 'pytest', 'tests/test_x.py::test_y', '-q']);
  assert.deepEqual(opts.command, ['pytest', 'tests/test_x.py::test_y', '-q']);
  assert.equal(opts.runs, 20);
  assert.equal(opts.parallel, 1);
  assert.equal(opts.untilFail, false);
  assert.equal(opts.timeout, 0);
  const b = parseArgs(['--runs', '50', '--parallel', '4', '--until-fail', '--timeout', '2.5', '--json', 'out.json', '--shell', '--quiet', '--', 'go', 'test', '--runs', '3']).opts;
  assert.equal(b.runs, 50);
  assert.equal(b.parallel, 4);
  assert.equal(b.untilFail, true);
  assert.equal(b.timeout, 2.5);
  assert.equal(b.json, 'out.json');
  assert.equal(b.shell, true);
  assert.equal(b.quiet, true);
  assert.deepEqual(b.command, ['go', 'test', '--runs', '3'], 'options after -- belong to the command');
});

test('parseArgs: rejects what it cannot use', () => {
  assert.match(parseArgs(['--runs', '5', 'npm', 'test']).error, /missing "--"/);
  assert.match(parseArgs(['--runs', '5', '--']).error, /no command/);
  assert.match(parseArgs(['--runs', '0', '--', 'x']).error, /--runs/);
  assert.match(parseArgs(['--runs', '2.5', '--', 'x']).error, /--runs/);
  assert.match(parseArgs(['--runs', 'many', '--', 'x']).error, /--runs/);
  assert.match(parseArgs(['--parallel', '--', 'x']).error, /--parallel/);
  assert.match(parseArgs(['--json', '--', 'x']).error, /--json/);
  assert.match(parseArgs(['--retry', '--', 'x']).error, /unknown option/);
});

test('wilson: known values, bounds, and no collapse at zero failures', () => {
  const a = wilson(5, 100);
  near(a.low, 0.0215);
  near(a.high, 0.1118);
  const z = wilson(0, 60);
  assert.equal(z.low, 0);
  near(z.high, 0.0602);
  const all = wilson(10, 10);
  near(all.high, 1);
  assert.ok(all.low > 0.69 && all.low < 0.73);
  assert.deepEqual(wilson(0, 0), { low: 0, high: 1 });
});

test('runsNeeded: about 3/p clean runs for 95% confidence', () => {
  assert.equal(runsNeeded(0.05), 59);
  assert.equal(runsNeeded(0.01), 299);
  assert.equal(runsNeeded(0.1), 29);
  assert.equal(runsNeeded(0.05, 0.99), 90);
  assert.throws(() => runsNeeded(0));
  assert.throws(() => runsNeeded(1));
});

test('normalizeSignature: merges output that differs only in noise', () => {
  const a = '\u001b[31mFAIL\u001b[0m test_y at 2026-03-01T10:22:33.123Z\nTimeout after 5003ms connecting to localhost:54321\npid 48211 tmp /tmp/pytest-of-ci/pytest-17/data.db\nid 3f2a1b4c-1111-2222-3333-444455556666 obj 0x7ffde4a1\n';
  const b = 'FAIL test_y at 2026-03-02T01:02:03Z\nTimeout after 4998ms connecting to localhost:60001\npid 9102 tmp /tmp/pytest-of-ci/pytest-3/data.db\nid 00000000-aaaa-bbbb-cccc-ddddeeeeffff obj 0x55aa10ff\n\n\n';
  assert.equal(normalizeSignature(a), normalizeSignature(b));
  assert.equal(signatureId(normalizeSignature(a)), signatureId(normalizeSignature(b)));
});

test('normalizeSignature: keeps different failures apart', () => {
  assert.notEqual(normalizeSignature('AssertionError: expected 3, got 4'), normalizeSignature('AssertionError: expected 3, got 5'));
  assert.notEqual(normalizeSignature('KeyError: user'), normalizeSignature('ConnectionRefusedError'));
  assert.notEqual(normalizeSignature('at parse (src/a.js:12:5)'), normalizeSignature('at parse (src/a.js:40:5)'));
});

test('normalizeSignature: uses only the last N non-empty lines', () => {
  const early = 'setup noise 1\nsetup noise 2\nFAILED x\nboom';
  const other = 'totally different preamble\nFAILED x\nboom';
  assert.equal(normalizeSignature(early, 2), normalizeSignature(other, 2));
  assert.notEqual(normalizeSignature(early, 3), normalizeSignature(other, 3));
});

test('summarize: counts, rate, pattern, durations and grouped failures', () => {
  const rec = (index, outcome, output = '', durationMs = 100) => ({ index, outcome, code: outcome === 'pass' ? 0 : 1, signal: null, durationMs, output });
  const s = summarize([
    rec(3, 'fail', 'Error: port 3000 in use at 12:00:01'),
    rec(1, 'pass', '', 50),
    rec(2, 'pass', '', 150),
    rec(4, 'timeout', 'partial'),
    rec(5, 'fail', 'Error: port 3000 in use at 12:00:09'),
    rec(6, 'fail', 'AssertionError: 1 != 2', 400),
  ]);
  assert.equal(s.runs, 6);
  assert.equal(s.passed, 2);
  assert.equal(s.failed, 4);
  assert.equal(s.timedOut, 1);
  near(s.rate, 4 / 6);
  assert.equal(s.pattern, '..FTFF');
  assert.equal(s.durationsMs.min, 50);
  assert.equal(s.durationsMs.max, 400);
  assert.equal(s.failures.length, 3);
  assert.deepEqual(s.failures[0].runs, [3, 5], 'same failure in runs 3 and 5 groups together, most frequent first');
  assert.equal(s.failures[0].firstRun, 3);
  assert.equal(s.failures.find((g) => g.outcome === 'timeout').count, 1);
});

test('repeat: until-fail stops scheduling, parallel respects the limit, a start error is fatal', async () => {
  const seen = [];
  const fake = async (_o, i) => { seen.push(i); return { index: i, outcome: i === 3 ? 'fail' : 'pass', code: 0, durationMs: 1, output: '' }; };
  const r = await repeat({ runs: 10, parallel: 1, untilFail: true }, { runner: fake });
  assert.equal(r.length, 3);
  let running = 0;
  let peak = 0;
  const slow = async (_o, i) => { running++; peak = Math.max(peak, running); await new Promise((res) => setTimeout(res, 5)); running--; return { index: i, outcome: 'pass', durationMs: 5 }; };
  const p = await repeat({ runs: 9, parallel: 3, untilFail: false }, { runner: slow });
  assert.equal(p.length, 9);
  assert.equal(peak, 3);
  await assert.rejects(repeat({ runs: 3, parallel: 1 }, { runner: async () => { throw new Error('ENOENT'); } }), /ENOENT/);
});

// The fixture keeps its own invocation counter in a file, like a real test with leaked state, and fails on every
// third invocation with output whose numbers and timestamps change each time. A separate failure mode on invocation 5.
const FIXTURE = [
  "import { readFileSync, writeFileSync, existsSync } from 'node:fs';",
  'const f = process.env.COUNTER_FILE;',
  "const n = (existsSync(f) ? Number(readFileSync(f, 'utf8')) : 0) + 1;",
  'writeFileSync(f, String(n));',
  "console.log('running case, worker id ' + (40000 + n));",
  "if (n === 5) { console.error('TypeError: cannot read properties of undefined'); process.exit(1); }",
  "if (n % 3 === 0) { console.error('Error: expected 200, got 503 after ' + (1000 + n) + 'ms at ' + new Date().toISOString()); process.exit(1); }",
  "if (process.env.HANG_ON && Number(process.env.HANG_ON) === n) setInterval(() => {}, 1000);",
].join('\n');

function setup() {
  const dir = tempDir('flaky-hunt-');
  const fixture = join(dir, 'fixture.mjs');
  writeFileSync(fixture, FIXTURE);
  return { dir, fixture, counter: join(dir, 'count.txt') };
}

test('end to end: counts a deterministic failure pattern and groups it into two signatures', () => {
  const { dir, fixture, counter } = setup();
  const json = join(dir, 'out.json');
  const r = runNode(SCRIPT, { args: ['--runs', '10', '--quiet', '--json', json, '--', process.execPath, fixture], env: { COUNTER_FILE: counter } });
  assert.equal(r.code, 1, r.stderr);
  // Failing invocations: 3, 5, 6, 9.
  assert.match(r.stdout, /Runs: 10 {3}passed: 6 {3}failed: 4/);
  assert.match(r.stdout, /Failure rate: 4\/10 = 40%/);
  assert.match(r.stdout, /Pattern \(run order, \. pass, F fail, T timeout\): \.\.F\.FF\.\.F\./);
  assert.match(r.stdout, /Distinct failure signatures: 2/);
  const data = JSON.parse(readFileSync(json, 'utf8'));
  assert.equal(data.summary.failed, 4);
  assert.equal(data.runs.length, 10);
  assert.deepEqual(data.failures.map((g) => g.runs), [[3, 6, 9], [5]]);
  assert.match(data.failures[0].example, /expected 200, got 503/);
});

test('end to end: --until-fail stops at the first failure and exit code 0 when all pass', () => {
  const a = setup();
  const r = runNode(SCRIPT, { args: ['--runs', '50', '--until-fail', '--quiet', '--', process.execPath, a.fixture], env: { COUNTER_FILE: a.counter } });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Runs: 3 /);
  const b = setup();
  const ok = runNode(SCRIPT, { args: ['--runs', '2', '--quiet', '--', process.execPath, b.fixture], env: { COUNTER_FILE: b.counter } });
  assert.equal(ok.code, 0, ok.stdout);
  assert.match(ok.stdout, /No failures/);
});

test('end to end: a hanging run is killed by --timeout and reported as T', () => {
  const { fixture, counter } = setup();
  const r = runNode(SCRIPT, { args: ['--runs', '2', '--timeout', '1', '--quiet', '--', process.execPath, fixture], env: { COUNTER_FILE: counter, HANG_ON: '2' } });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /timed out: 1/);
  assert.match(r.stdout, /: \.T/);
});

test('end to end: usage errors and a command that cannot start exit 2', () => {
  assert.equal(runNode(SCRIPT, { args: ['--runs', '3'] }).code, 2);
  const r = runNode(SCRIPT, { args: ['--runs', '3', '--quiet', '--', 'no-such-command-for-repeat-test'] });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Could not start/);
});
