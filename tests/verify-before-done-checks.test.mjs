// The verify-before-done Stop hook counts the checks a project declares in .claude/review-rules.json, its block
// message says how to stop a false alarm, and a task notification does not hide the edits made before it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repo, runNode, tempDir } from './helpers.mjs';
import { decide, assess, toolCallsSinceLastPrompt, isUserPrompt } from '../hooks/verification/verify-before-done.mjs';

const HOOK = repo('hooks', 'verification', 'verify-before-done.mjs');

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const human = (text) => ({ ...user(text), origin: { kind: 'human' } });
const result = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name, input }] } });
const say = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const edit = (file_path) => tool('Edit', { file_path, old_string: 'a', new_string: 'b' });
const bash = (command) => tool('Bash', { command });
const jsonl = (entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const turn = (...entries) => toolCallsSinceLastPrompt([user('go'), ...entries]);
const show = (c) => c.replace(/\n/g, ' (new line) ').replace(/\t/g, ' (tab) ');
const gate = (command, checks = ['bin/gate --full']) => assess(turn(edit('src/main.lua'), bash(command)), {}, {}, checks).verified;

describe('verify-before-done: checks declared in .claude/review-rules.json', () => {
  for (const c of [
    'bin/gate --full', 'cd app && bin/gate --full', 'true; bin/gate --full', '(bin/gate --full)', 'cd app\nbin/gate --full',
    'timeout 600 bin/gate --full', 'bin/gate   --full', 'bin/gate --full > out.txt 2>&1', 'bin/gate --full; echo done',
    'bin/gate --full\necho done', 'bin/gate --full>out.txt', 'bin/gate --full</dev/null', 'bin/gate --full&& echo ok',
    'bin/gate --full|tee log', 'bin/gate\t--full',
  ]) {
    test(`counts: ${show(c)}`, () => {
      assert.equal(gate(c, []), false, `without the check: ${c}`);
      assert.equal(gate(c), true, c);
    });
  }
  test('counts: the check "  bin/gate   --full  " against bin/gate --full', () => {
    assert.equal(gate('bin/gate --full', ['  bin/gate   --full  ']), true);
  });
  for (const c of ['echo "bin/gate --full"', 'echo bin/gate --full', 'xbin/gate --full', 'bin/gate --fuller', 'bin/gate', 'BIN/GATE --full']) {
    test(`does not count: ${c}`, () => assert.equal(gate(c), false, c));
  }
  test('does not count: the check bin/gate.sh against bin/gateXsh', () => assert.equal(gate('bin/gateXsh', ['bin/gate.sh']), false));
  test('counts: the check bin/gate.sh against bin/gate.sh', () => assert.equal(gate('bin/gate.sh', ['bin/gate.sh']), true));
  test('a valid check in the middle of the list counts', () => {
    assert.equal(gate('bin/gate --full', ['make lint', 'bin/gate --full', 'cargo xtask ci']), true);
  });
  test('blank entries are skipped', () => {
    for (const list of [['', 'bin/gate --full'], ['bin/gate --full', '   '], ['\t', 'bin/gate --full', '']]) {
      assert.equal(gate('ls; pwd', list), false, JSON.stringify(list));
      assert.equal(gate('bin/gate --full', list), true, JSON.stringify(list));
    }
  });
  test('a list of blank entries only counts as no checks', () => {
    for (const list of [[''], ['   '], ['\t']]) assert.equal(gate('ls; pwd', list), false, JSON.stringify(list));
  });
  test('entries that are not strings are skipped, and nothing throws', () => {
    for (const list of [[5, null, {}, ['bin/gate --full'], 'bin/gate --full'], ['bin/gate --full', 5, null, {}, ['bin/gate --full']],
      [5, null, 'bin/gate --full', {}, ['bin/gate --full']]]) {
      assert.equal(gate('bin/gate --full', list), true, JSON.stringify(list));
      assert.equal(gate('ls; pwd', list), false, JSON.stringify(list));
    }
  });
  test('an entry that is not a string is never turned into text', () => {
    assert.equal(gate('bin/gate --full', [['bin/gate --full']]), false);
    assert.equal(gate('bin/gate --full', 'bin/gate --full'), false);
    assert.equal(gate('bin/gate --full', null), false);
  });
  test('checks in the hook options do not count', () => {
    assert.equal(assess(turn(edit('src/main.lua'), bash('bin/gate --full')), { checks: ['bin/gate --full'] }).verified, false);
  });
  test('decide passes the checks on', () => {
    const transcript = jsonl([user('fix it'), edit('src/main.lua'), bash('bin/gate --full'), result()]);
    assert.equal(decide({ stop_hook_active: false }, { transcript, checks: ['bin/gate --full'] }), null);
    assert.equal(decide({ stop_hook_active: false }, { transcript }).decision, 'block');
  });
});

describe('verify-before-done: the review-rules file, as a hook', () => {
  const hook = (P, command, cwd = P) => {
    const transcript_path = join(tempDir(), 't.jsonl');
    writeFileSync(transcript_path, jsonl([user('fix it'), edit(join(P, 'src', 'main.lua')), bash(command), result()]));
    return runNode(HOOK, {
      input: JSON.stringify({ hook_event_name: 'Stop', transcript_path, stop_hook_active: false, cwd }),
      env: { CLAUDE_PROJECT_DIR: P, PAU_SKILLS_HOME: tempDir(), PAU_SKILLS_DISABLE: '' },
    });
  };
  const project = (text) => {
    const P = tempDir();
    if (text !== undefined) { mkdirSync(join(P, '.claude')); writeFileSync(join(P, '.claude', 'review-rules.json'), text); }
    return P;
  };
  const silent = (r, how) => assert.deepEqual([r.code, r.stdout, r.stderr], [0, '', ''], how);
  const blocks = (r, how) => {
    assert.deepEqual([r.code, r.stderr], [0, ''], how);
    assert.equal(JSON.parse(r.stdout || 'null')?.decision, 'block', how);
  };
  test('a declared check counts', () => silent(hook(project('{"checks":["bin/gate --full"]}'), 'bin/gate --full'), 'review-rules'));
  test('a declared check counts in a file with a byte order mark', () => {
    silent(hook(project(String.fromCharCode(0xfeff) + '{"checks":["bin/gate --full"]}'), 'bin/gate --full'), 'BOM');
  });
  for (const [how, text] of [['no file', undefined], ['broken', '{"checks": ['], ['null', 'null'], ['an array', '["bin/gate --full"]'],
    ['a string', '"bin/gate --full"'], ['checks a string', '{"checks": "bin/gate --full"}'], ['bad entries', '{"checks": [5, null, "", "  "]}']]) {
    test(`blocks with a review-rules file that is ${how}`, () => blocks(hook(project(text), 'bin/gate --full'), how));
  }
  test('the file is read from the project folder, not the cwd', () => {
    const P = project(), P2 = project('{"checks":["bin/gate --full"]}');
    blocks(hook(P, 'bin/gate --full', P2), 'file in the cwd only');
  });
});

describe('verify-before-done: the block message', () => {
  const reason = () => decide({ stop_hook_active: false }, { transcript: jsonl([user('fix it'), edit('src/main.go'), result()]) }).reason;
  test('says how to name a check for this hook', () => {
    const r = reason();
    for (const s of ['main.go', 'testCommands', '.claude/pau-skills.json', 'checks', '.claude/review-rules.json',
      '{"verify-before-done": {"testCommands": ["^bin/gate"]}}', '{"checks": ["bin/gate --full"]}']) assert.ok(r.includes(s), s);
  });
  test('the fixed text names no file the other tests look for', () => {
    const r = reason();
    for (const re of [/a\.ts/, /a\.js/, /b\.js/, /a\.rs/, /config\.json/]) assert.doesNotMatch(r, re);
  });
});

describe('verify-before-done: a task notification is not the user', () => {
  const note = (content) => ({ type: 'user', origin: { kind: 'task-notification', producer: 'session-task' }, promptSource: 'system',
    turnOrigin: 'task_notification', message: { role: 'user', content } });
  const NOTE = note('<task-notification>...</task-notification>');
  const outcome = (...entries) => decide({ stop_hook_active: false }, { transcript: jsonl(entries) });
  test('a notification with string content does not hide the edit', () => {
    const out = outcome(human('go'), edit('src/main.js'), result(), NOTE, say('done'));
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, /main\.js/);
  });
  test('a notification with text blocks does not hide the edit', () => {
    const out = outcome(human('go'), edit('src/main.js'), result(), note([{ type: 'text', text: '<task-notification>...' }]), say('done'));
    assert.equal(out?.decision, 'block');
    assert.match(out.reason, /main\.js/);
  });
  test('isUserPrompt is false for the notification and for a peer message', () => {
    assert.equal(isUserPrompt(NOTE), false);
    assert.equal(isUserPrompt({ type: 'user', origin: { kind: 'peer' }, message: { role: 'user', content: 'hello' } }), false);
  });
  test('isUserPrompt is false for every kind sent by the harness or an agent', () => {
    for (const kind of ['coordinator', 'channel', 'auto-continuation', 'peer', 'task-notification']) {
      assert.equal(isUserPrompt({ ...user('hello'), origin: { kind } }), false, kind);
    }
  });
  test('isUserPrompt is true for a human message and for other kinds', () => {
    assert.equal(isUserPrompt(human('hello')), true);
    assert.equal(isUserPrompt({ ...user('hello'), origin: { kind: 'suggestion' } }), true);
    assert.equal(isUserPrompt({ ...user('hello'), origin: { kind: 'xyz' } }), true);
    assert.equal(isUserPrompt({ ...user('hello'), origin: 'task-notification' }), true);
  });
  test('a new message from the user still moves the window', () => {
    assert.equal(outcome(human('first'), edit('src/main.js'), result(), human('second')), null);
    assert.equal(outcome(user('first'), edit('src/main.js'), result(), user('second')), null);
    const empty = (text) => ({ ...user(text), origin: {} });
    assert.equal(outcome(empty('first'), edit('src/main.js'), result(), empty('second')), null);
  });
  test('a check, then a notification: not blocked', () => {
    assert.equal(outcome(human('go'), edit('src/main.js'), bash('npm test'), result(), NOTE), null);
  });
});

// Each runs in a child process killed after 10 s; the command goes in on standard input, since one argument over
// 131,072 bytes fails to spawn on Linux.
function timed(command, checks = []) {
  const code = 'import { assess } from ' + JSON.stringify(pathToFileURL(HOOK).href) + ';\n' +
    "import { readFileSync } from 'node:fs';\n" +
    "const { command, checks } = JSON.parse(readFileSync(0, 'utf8'));\n" +
    "const calls = [{ name: 'Edit', input: { file_path: 'src/main.lua' } }, { name: 'Bash', input: { command } }];\n" +
    'const t = performance.now(); const r = assess(calls, {}, {}, checks);\n' +
    'console.log(JSON.stringify({ verified: r.verified, ms: performance.now() - t }));';
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { input: JSON.stringify({ command, checks }), encoding: 'utf8', timeout: 10000 });
  assert.equal(run.signal, null, 'killed after 10 s');
  const { verified, ms } = JSON.parse(run.stdout);
  assert.equal(verified, false);
  assert.ok(ms < 500, `${ms} ms`);
  return ms;
}
const fill = (s, n) => s.repeat(Math.ceil(n / s.length));

describe('verify-before-done: long commands that are not checks are read in under 500 ms', () => {
  for (const [name, command, checks] of [
    ['many (bin/gate --ful', fill('(bin/gate --ful', 100000), ['bin/gate --full']],
    ['200 checks', fill('bin/gate --step; ', 20000), Array.from({ length: 200 }, (_, i) => `bin/gate --step${i}`)],
    ['200 checks, 300,000 characters', fill('bin/gate --step; ', 300000), Array.from({ length: 200 }, (_, i) => `bin/gate --step${i}`)],
  ]) {
    test(`timing: ${name}`, (t) => t.diagnostic(`${timed(command, checks).toFixed(1)} ms`));
  }
});

