// The replay script of the project-setup eval: it sends a saved run, cut after a chosen turn, to the persona a few
// times and counts the replies that end the conversation. The persona call is a fake here. replay.mjs and run.mjs
// start real `claude -p` calls only when they are the entry point; PATH is emptied before the import and stays empty
// for this whole file, so that, if that guard ever breaks, no `claude` can start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';

process.env.PATH = tempDir();
const { cutTranscript, replayArgs, replay, basePersonaSystemPrompt } = await import('../evals/project-setup/replay.mjs');
const { personaSystemPrompt } = await import('../evals/project-setup/run.mjs');

const EVALS = join(ROOT, 'evals', 'project-setup');
const REPLAY = join(EVALS, 'replay.mjs');
const HOBBYIST = readFileSync(join(EVALS, 'personas', 'hobbyist.md'), 'utf8');

/** Three turns; every text differs from every other. */
const THREE = [
  { role: 'user', text: 'opening one' },
  { role: 'assistant', text: 'answer one' },
  { role: 'user', text: 'reply two' },
  { role: 'assistant', text: 'answer two, the cut ends here' },
  { role: 'user', text: 'reply three' },
  { role: 'assistant', text: 'answer three' },
];

/** A run folder with scenario.json and a 3-turn transcript.json. */
function runFolder() {
  const dir = tempDir();
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify({ name: 'x', persona: 'personas/hobbyist.md' }));
  writeFileSync(join(dir, 'transcript.json'), JSON.stringify(THREE));
  return dir;
}

/** A fake persona call that gives the results in order and records each call and whether its folder was empty. */
function fakeAsk(results) {
  const calls = [];
  const fn = (system, transcript, opts) => {
    calls.push({ system, transcript: structuredClone(transcript), opts: { ...opts }, empty: readdirSync(opts.cwd).length === 0 });
    return { result: results[calls.length - 1], total_cost_usd: 0.011 };
  };
  return { calls, fn };
}

test("cutTranscript keeps the first n turns, ending on the assistant's n-th message", () => {
  for (const [n, len] of [[1, 2], [2, 4], [3, 6]]) {
    const cut = cutTranscript(THREE, n);
    assert.equal(cut.length, len, `turns ${n}`);
    assert.equal(cut.at(-1).role, 'assistant');
    assert.deepEqual(cut, THREE.slice(0, len));
  }
});

test('cutTranscript refuses a cut that is not a whole number from 1 to the number of turns', () => {
  for (const n of [0, -1, 2.5, NaN, 4, '2']) {
    assert.throws(() => cutTranscript(THREE, n), /--turns must be a whole number from 1 to 3/, String(n));
  }
});

test('replayArgs reads the run folder, --turns, --prompt, --times and --persona-model, and refuses anything else', () => {
  const o = replayArgs(['some/run', '--turns', '21', '--prompt', 'new']);
  assert.equal(o.runDir, 'some/run');
  assert.equal(o.turns, 21);
  assert.equal(o.prompt, 'new');
  assert.equal(o.times, 4);
  assert.equal(o.personaModel, undefined);
  const p = replayArgs(['--prompt', 'base', '--times', '2', 'other', '--persona-model', 'm', '--turns', '3']);
  assert.equal(p.runDir, 'other');
  assert.equal(p.turns, 3);
  assert.equal(p.prompt, 'base');
  assert.equal(p.times, 2);
  assert.equal(p.personaModel, 'm');
  const bad = [
    ['--turns', '3', '--prompt', 'new'],
    ['a', 'b', '--turns', '3', '--prompt', 'new'],
    ['a', '--prompt', 'new'],
    ['a', '--turns', '0', '--prompt', 'new'],
    ['a', '--turns', '2.5', '--prompt', 'new'],
    ['a', '--turns', 'x', '--prompt', 'new'],
    ['a', '--turns', '3'],
    ['a', '--turns', '3', '--prompt', 'other'],
    ['a', '--turns', '3', '--prompt', 'new', '--times', '0'],
    ['a', '--turns', '3', '--prompt', 'new', '--foo'],
  ];
  for (const argv of bad) assert.throws(() => replayArgs(argv), Error, argv.join(' '));
});

test('replay asks the new prompt n times with the cut transcript in an empty side folder, counts the replies that end, and writes replay-new.json', () => {
  const runDir = runFolder();
  const fake = fakeAsk(['[END]', 'Yes, go on.', ' Thanks. [END] ', 'ok']);
  const r = replay({ runDir, turns: 2, prompt: 'new', times: 4, personaModel: 'm' }, fake.fn);
  assert.equal(fake.calls.length, 4);
  const system = personaSystemPrompt(HOBBYIST);
  for (const c of fake.calls) {
    assert.equal(c.system, system);
    assert.deepEqual(c.transcript, THREE.slice(0, 4));
    assert.equal(c.opts.cwd, c.opts.home);
    assert.equal(c.opts.personaModel, 'm');
  }
  const side = fake.calls[0].opts.cwd;
  const rel = relative(ROOT, side);
  assert.ok(rel.startsWith('..') || isAbsolute(rel), `the side folder ${side} is outside the repository`);
  assert.equal(fake.calls[0].empty, true, 'the side folder is empty at the first call');
  assert.equal(existsSync(side), false, 'the side folder is gone after replay');
  const replies = ['[END]', 'Yes, go on.', 'Thanks. [END]', 'ok'];
  assert.equal(r.prompt, 'new');
  assert.equal(r.turns, 2);
  assert.equal(r.times, 4);
  assert.equal(r.ended, 2);
  assert.equal(r.costUsd, 0.04);
  assert.equal(r.last, THREE[3].text);
  assert.deepEqual(r.replies, replies);
  const file = join(runDir, 'replay-new-2.json');
  assert.ok(existsSync(file), 'replay-new-2.json is written');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.ended, 2);
  assert.deepEqual(saved.replies, replies);
  assert.deepEqual(saved, r);

  const empty = tempDir();
  assert.throws(() => replay({ runDir: empty, turns: 1, prompt: 'new', times: 1 }, fakeAsk(['ok']).fn), /scenario\.json/);
  writeFileSync(join(empty, 'scenario.json'), JSON.stringify({ name: 'x', persona: 'personas/hobbyist.md' }));
  assert.throws(() => replay({ runDir: empty, turns: 1, prompt: 'new', times: 1 }, fakeAsk(['ok']).fn), /transcript\.json/);
});

test('replay with --prompt base sends the persona prompt from before Q13', () => {
  const runDir = runFolder();
  const fake = fakeAsk(['ok', '[END]']);
  const r = replay({ runDir, turns: 2, prompt: 'base', times: 2 }, fake.fn);
  assert.equal(fake.calls.length, 2);
  for (const c of fake.calls) {
    assert.equal(c.system, basePersonaSystemPrompt(HOBBYIST));
    assert.deepEqual(c.transcript, THREE.slice(0, 4));
  }
  assert.equal(r.ended, 1);
  assert.ok(existsSync(join(runDir, 'replay-base-2.json')), 'replay-base-2.json is written');
  const lines = basePersonaSystemPrompt('PERSONA').split('\n');
  assert.equal(lines.length, 8);
  assert.equal(lines[0], 'You are role-playing a person who is using Claude Code, as part of a test of a setup assistant. Stay in character.');
  assert.equal(lines[2], 'PERSONA');
  assert.equal(lines[6], 'If the setup is over and the assistant has started a first real task that you picked, reply with exactly [END].');
  assert.equal(lines[7], 'If the assistant asks nothing and nothing is left to answer, reply with exactly [END].');
  assert.ok(!basePersonaSystemPrompt('PERSONA').includes('wins over everything below'));
});

test('replay.mjs imports without running when argv[1] is not a file', () => {
  const code = "await import('./evals/project-setup/replay.mjs'); console.log('imported')";
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, 'nosuchfile'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: tempDir() } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'imported');
});

test('replay.mjs is the entry point also through a symlink: bad arguments print the usage line and exit 2', () => {
  const link = join(tempDir(), 'replay.mjs');
  symlinkSync(REPLAY, link);
  for (const path of [REPLAY, link]) {
    const r = spawnSync(process.execPath, [path], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: tempDir() } });
    assert.equal(r.status, 2, `${path}: ${r.stderr}`);
    assert.match(r.stderr, /^usage: node replay\.mjs <run dir> --turns <n> --prompt base\|new/m);
  }
});
