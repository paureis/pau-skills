// The cost of a project-setup eval run: runScenario and main go through the real turn loop and judge call with a fake
// `claude`, and the printed cost and summary.json count the assistant's, the persona's and the judge's calls, each
// part and the total rounded once from whole micro-dollars. run.mjs starts real `claude -p` runs only when it is the
// entry point; PATH is emptied before the import and stays empty for this whole file, so that, if a guard ever breaks,
// no `claude` can start. TMPDIR points at a fresh folder before the import, so a run that throws in main leaves
// nothing in the real temp folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { ROOT, removeAtExit, tempDir } from './helpers.mjs';

process.env.PATH = tempDir();
process.env.TMPDIR = tempDir();
const { runScenario, main } = await import('../evals/project-setup/run.mjs');

const NAME = 'hobbyist-empty-folder';
const scenarios = JSON.parse(readFileSync(join(ROOT, 'evals', 'project-setup', 'scenarios.json'), 'utf8'));
const scenario = scenarios.find((s) => s.name === NAME);

// The fake costs make each wrong sum give a different total (checked with whole micro-dollars):
//
// | Sum                                      | Total |
// |------------------------------------------|-------|
// | right total (3.362)                      | 3.36  |
// | sum of the rounded parts                 | 3.37  |
// | each call rounded to cents first         | 3.35  |
// | only the judge's call rounded first      | 3.37  |
// | only the assistant's calls rounded first | 3.35  |
// | without the persona                      | 3.05  |
// | without the judge                        | 3.32  |
// | without the assistant                    | 0.35  |
const ASSISTANT = [1.004, 2.004];
// The first persona reply has spaces and a newline around it, which the run trims.
const PERSONA = [['  ok\n', 0.104], ['[END]', 0.204]];
const JUDGE = 0.046;
const PARTS = { assistant: 3.01, persona: 0.31, judge: 0.05 };

/**
 * A fake claude(argv, { cwd, home, input }) that tells the calls apart by argv and records each one. A cost of
 * null leaves total_cost_usd out of that call's output.
 */
function fakeClaude({ assistant = ASSISTANT, persona = PERSONA, judge = JUDGE } = {}) {
  const calls = [];
  const n = { assistant: 0, persona: 0 };
  const cost = (usd) => (usd === null ? {} : { total_cost_usd: usd });
  const fn = (argv, { cwd, home }) => {
    const kind = argv.includes('--permission-mode') ? 'assistant' : argv.includes('--system-prompt') ? 'persona' : 'judge';
    calls.push({ kind, cwd, home });
    if (kind === 'assistant') { const i = n.assistant++; return { result: `answer ${i}`, ...cost(assistant[i]) }; }
    if (kind === 'persona') { const [result, usd] = persona[n.persona++]; return { result, ...cost(usd) }; }
    return { result: '{"scores":{"transparency":4}}', ...cost(judge) };
  };
  const of = (kind) => calls.filter((c) => c.kind === kind);
  return { calls, fn, of };
}

test('B1: runScenario counts the assistant, the persona and the judge, and rounds each sum once', () => {
  assert.ok(scenario, `no scenario ${NAME}`);
  assert.equal(scenario.fixture ?? null, null, 'the scenario has no fixture, so no git call');
  const out = tempDir();
  const fake = fakeClaude();
  const r = runScenario(scenario, { out, maxTurns: 40, judge: true }, fake.fn);
  assert.equal(fake.of('assistant').length, 2);
  assert.equal(fake.of('persona').length, 2);
  assert.equal(fake.of('judge').length, 1);
  assert.equal(r.turns, 2);
  assert.equal(r.costUsd, 3.36);
  assert.deepEqual(r.costPartsUsd, PARTS);
  assert.deepEqual(r.judge, { scores: { transparency: 4 } });
  const side = join(out, NAME, 'side');
  const project = join(out, NAME, 'project');
  for (const c of [...fake.of('persona'), ...fake.of('judge')]) {
    assert.equal(c.cwd, side, `${c.kind} runs in the side folder`);
    assert.equal(c.home, side, `${c.kind} has the side folder as HOME`);
  }
  const home = join(out, NAME, 'home');
  for (const c of fake.of('assistant')) {
    assert.equal(c.cwd, project, 'the assistant runs in the project folder');
    assert.equal(c.home, home, 'the assistant has the sandboxed HOME with the skill');
  }
  const transcript = JSON.parse(readFileSync(join(out, NAME, 'transcript.json'), 'utf8'));
  assert.equal(transcript[2].role, 'user');
  assert.equal(transcript[2].text, 'ok', 'the persona reply is trimmed');
});

test('a half cent rounds up, and a call without total_cost_usd counts as 0', () => {
  // Math.round(1.005 * 1e6) is 1005000, a half cent: it rounds up to 1.01 (1.005.toFixed(2) gives 1.00).
  const fake = fakeClaude({ assistant: [1.005, 0], judge: null });
  const r = runScenario(scenario, { out: tempDir(), maxTurns: 40, judge: true }, fake.fn);
  assert.equal(fake.of('judge').length, 1);
  assert.deepEqual(r.costPartsUsd, { assistant: 1.01, persona: 0.31, judge: 0 });
  assert.ok(Number.isFinite(r.costUsd), `the total is a number: ${r.costUsd}`);
  assert.equal(r.costUsd, 1.31);
});

test('B2: with --no-judge the judge is not called and its part is 0', () => {
  const fake = fakeClaude();
  const r = runScenario(scenario, { out: tempDir(), maxTurns: 40, judge: false }, fake.fn);
  assert.equal(fake.of('judge').length, 0);
  assert.equal(fake.of('persona').length, 2);
  assert.equal(r.costPartsUsd.judge, 0);
  assert.equal(r.costUsd, 3.32);
  assert.equal('judge' in r, false, 'no judge key');
});

/** Call main with the fake and collect the logged lines; the first line is registered for removal at once. */
function runMain(argv) {
  const fake = fakeClaude();
  const lines = [];
  let ret;
  try {
    ret = main(argv, { call: fake.fn, log: (l) => lines.push(l) });
  } finally {
    if (lines[0]) removeAtExit(lines[0]);
  }
  return { fake, lines, out: lines[0], ret };
}

test('B3: main writes into a fresh temp folder, prints it first, and prints and saves the total and the parts', () => {
  const { lines, out, ret } = runMain(['--scenario', NAME]);
  assert.equal(ret?.out, out, 'main returns the folder it logged first');
  assert.equal(ret.results.length, 1);
  assert.equal(ret.results[0].costUsd, 3.36);
  assert.ok(isAbsolute(out), `the first line is an absolute path: ${out}`);
  assert.ok(existsSync(out), `${out} exists`);
  assert.equal(realpathSync(dirname(out)), realpathSync(tmpdir()), 'its parent is the system temp folder');
  const rel = relative(realpathSync(ROOT), realpathSync(out));
  assert.ok(rel.startsWith('..') || isAbsolute(rel), `${out} is outside the repository`);
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.length, 1);
  assert.equal(summary[0].costUsd, 3.36);
  assert.deepEqual(summary[0].costPartsUsd, PARTS);
  assert.ok(existsSync(join(out, NAME, 'transcript.json')));
  const line = /hobbyist-empty-folder: \d+\/\d+ checks, 2 turns, \$3\.36 \(assistant \$3\.01, persona \$0\.31, judge \$0\.05\)/;
  assert.equal(lines.filter((l) => line.test(l)).length, 1, lines.join('\n'));
});

test('B4: a baseline run writes summary-baseline.json and no summary.json', () => {
  const { fake, lines, out } = runMain(['--scenario', NAME, '--baseline', '--no-judge']);
  assert.equal(fake.of('judge').length, 0);
  const line = /^\nhobbyist-empty-folder-baseline: \d+\/\d+ checks, 2 turns, \$3\.32 \(assistant \$3\.01, persona \$0\.31, judge \$0\.00\)$/;
  assert.equal(lines.filter((l) => line.test(l)).length, 1, lines.join('\n'));
  assert.ok(existsSync(join(out, 'summary-baseline.json')));
  assert.equal(existsSync(join(out, 'summary.json')), false);
  assert.ok(existsSync(join(out, `${NAME}-baseline`, 'transcript.json')));
});
