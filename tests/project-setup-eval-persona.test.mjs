// The persona side of the project-setup eval runner: when a persona reply ends the run, the turn loop, the persona's
// system prompt (the end rule comes first and wins over the persona) and the claude arguments of a persona call.
// run.mjs starts real `claude -p` runs only when it is the entry point; PATH is emptied before the import and stays
// empty for this whole file, so that, if that guard ever breaks, no `claude` can start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';

process.env.PATH = tempDir();
const { isEnd, converse, personaSystemPrompt, personaCall } = await import('../evals/project-setup/run.mjs');

const EVALS = join(ROOT, 'evals', 'project-setup');
const scenarios = JSON.parse(readFileSync(join(EVALS, 'scenarios.json'), 'utf8'));

/** A fake assistant that answers `answer <turn>` and records each (message, turn) it gets. */
function fakeAssistant() {
  const calls = [];
  const fn = (message, turn) => { calls.push([message, turn]); return `answer ${turn}`; };
  return { calls, fn };
}

/** A fake persona that gives the replies in order, then the last one forever, and counts its calls. */
function fakePersona(replies) {
  const p = { calls: 0 };
  p.fn = () => replies[Math.min(p.calls++, replies.length - 1)];
  return p;
}

/** How many times needle occurs in text. */
const count = (text, needle) => text.split(needle).length - 1;

test('isEnd is true for a reply that holds [END] anywhere', () => {
  for (const r of ['[END]', '[END]\n', 'Thanks, that is all. [END]', '[END] Thanks.', 'Okay.\n\n[END]']) {
    assert.equal(isEnd(r), true, JSON.stringify(r));
  }
});

test('isEnd is false for a reply without [END]', () => {
  for (const r of ['', 'END', 'The END.', 'We can end here.', '[ END ]', '[END', 'END]']) {
    assert.equal(isEnd(r), false, JSON.stringify(r));
  }
});

test('converse stops after the first persona reply that holds [END] and does not send that reply', () => {
  const a = fakeAssistant();
  const p = fakePersona(['yes', 'number 2', 'Thanks, that is all. [END]', 'never sent']);
  const t = converse({ opening: 'OPENING', maxTurns: 40, assistant: a.fn, persona: p.fn });
  assert.equal(t.length, 6);
  assert.deepEqual(a.calls, [['OPENING', 0], ['yes', 1], ['number 2', 2]]);
  assert.equal(p.calls, 3);
  assert.ok(t.every((m) => !m.text.includes('[END]')), 'no entry holds [END]');
  assert.deepEqual(t.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);

  const b = fakeAssistant();
  const once = fakePersona(['[END]']);
  assert.equal(converse({ opening: 'OPENING', maxTurns: 40, assistant: b.fn, persona: once.fn }).length, 2);
});

test('converse stops at the turn limit when the persona never ends', () => {
  const a = fakeAssistant();
  const p = fakePersona(['yes']);
  const t = converse({ opening: 'OPENING', maxTurns: 3, assistant: a.fn, persona: p.fn });
  assert.equal(t.length, 6);
  assert.equal(a.calls.length, 3);
});

test('the persona system prompt starts with the end rule, before the persona, and has no old end rule', () => {
  const prompt = personaSystemPrompt('PERSONA TEXT');
  const lines = prompt.split('\n');
  assert.ok(lines[0].includes('wins over everything below, including the persona'), lines[0]);
  const personaLine = lines.indexOf('PERSONA TEXT');
  assert.ok(personaLine > 0, 'the persona has its own line');
  const endLines = lines.map((l, i) => (l.includes('[END]') ? i : -1)).filter((i) => i >= 0);
  assert.ok(endLines.length > 0, 'some line holds [END]');
  for (const i of endLines) assert.ok(i < personaLine, `line ${i} holds [END] after the persona: ${lines[i]}`);
  assert.doesNotMatch(prompt, /If the setup is over/);
  assert.equal(lines.filter((l) => l.includes('Stay in character')).length, 1);
  const reminder = 'check the end rule at the top';
  const held = lines.filter((l) => l.includes(reminder));
  assert.equal(held.length, 1, 'exactly one line holds the reminder');
  assert.equal(count(held[0], reminder), 1);
  assert.equal(count(prompt.replace(/\s+/g, ' '), reminder), 1);
});

test('each end rule anchor sits whole on one line, once, before the persona, for every scenario persona', () => {
  const anchors = [
    'wins over everything below, including the persona',
    'once all three of these have happened, in this order',
    'The assistant recommended a first task',
    'said which task to do',
    'an assistant message works on that task',
    'reads, explains or changes something for it',
    'even when that message asks you a question or asks you to approve a change',
    'You do not take part in the task',
    'asks nothing and nothing is left to answer',
    'except where the end rule says otherwise',
  ];
  const personas = [...new Set(scenarios.map((s) => s.persona))].map((p) => [p, readFileSync(join(EVALS, p), 'utf8')]);
  assert.ok(personas.length > 0);
  for (const [name, persona] of [...personas, ['inline', 'PERSONA TEXT']]) {
    const prompt = personaSystemPrompt(persona);
    const lines = prompt.split('\n');
    const at = prompt.indexOf(persona);
    assert.ok(at >= 0, `${name}: the persona is in the prompt`);
    const personaLine = prompt.slice(0, at).split('\n').length - 1;
    const flat = prompt.replace(/\s+/g, ' ');
    for (const a of anchors) {
      const held = lines.map((l, i) => [l, i]).filter(([l]) => l.includes(a));
      assert.equal(held.length, 1, `${name}: exactly one line holds "${a}"`);
      assert.equal(count(held[0][0], a), 1, `${name}: "${a}" once in its line`);
      assert.equal(count(flat, a), 1, `${name}: "${a}" once in the flattened prompt`);
      assert.ok(held[0][1] < personaLine, `${name}: "${a}" comes before the persona`);
    }
  }
});

test('personaCall builds the same claude arguments and input as before Q13', () => {
  const transcript = [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }];
  const withModel = personaCall('SYS', transcript, { personaModel: 'm' });
  assert.deepEqual(withModel.argv, ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--system-prompt', 'SYS', '--model', 'm']);
  assert.equal(withModel.input, 'Conversation so far:\n\nYOU:\nhi\n\n---\n\nASSISTANT:\nhello\n\nWrite your next message.');
  const plain = personaCall('SYS', transcript);
  assert.deepEqual(plain.argv, ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--system-prompt', 'SYS']);
  assert.ok(!plain.argv.includes('--model'));
  assert.equal(plain.input, withModel.input);
});
