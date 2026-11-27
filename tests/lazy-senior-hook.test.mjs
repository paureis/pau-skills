// The lazy-senior hook adds the lazy-senior ruleset as additionalContext at every SessionStart (startup, resume, clear,
// compact) and every SubagentStart, and stays silent on every other event and on input it does not understand. The
// skill's RULES.md holds the same text as the hook's RULESET, so the two copies never drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repo, runNode, tempDir } from './helpers.mjs';
import { decide, RULESET, SIGNATURE } from '../hooks/planning/lazy-senior.mjs';

const HOOK = repo('hooks', 'planning', 'lazy-senior.mjs');
const BOM = String.fromCharCode(0xfeff);
// The hook reads the user and project config and PAU_SKILLS_DISABLE; this env keeps the caller's own out of the result.
const isolated = () => ({ PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: tempDir(), PAU_SKILLS_DISABLE: '' });
const run = (input) => runNode(HOOK, { input, env: isolated() });
const CONTEXT = RULESET + '\n' + SIGNATURE;

// One JSON line on stdout with the given event name and the whole context, exit 0, nothing on stderr.
const speaks = (r, event) => {
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  assert.match(r.stdout, /^[^\n]+\n$/, 'one line');
  const out = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(out), ['hookSpecificOutput']);
  assert.equal(out.hookSpecificOutput.hookEventName, event);
  assert.ok(out.hookSpecificOutput.additionalContext.startsWith(RULESET));
  assert.equal(out.hookSpecificOutput.additionalContext, CONTEXT);
};
const silent = (r, why) => {
  assert.equal(r.code, 0, why);
  assert.equal(r.stdout, '', why);
  assert.equal(r.stderr, '', why);
};

for (const source of ['startup', 'resume', 'clear', 'compact']) {
  test(`SessionStart with source ${source}: the ruleset as additionalContext`, () => {
    speaks(run(JSON.stringify({ hook_event_name: 'SessionStart', source })), 'SessionStart');
  });
}

test('SubagentStart, with and without agent_type: the ruleset as additionalContext', () => {
  speaks(run(JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'general-purpose' })), 'SubagentStart');
  speaks(run(JSON.stringify({ hook_event_name: 'SubagentStart' })), 'SubagentStart');
});

test('a byte order mark before valid JSON is honoured', () => {
  speaks(run(BOM + JSON.stringify({ hook_event_name: 'SubagentStart' })), 'SubagentStart');
});

test('every other event and every input it does not understand: silent, exit 0', () => {
  const inputs = [
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }),
    JSON.stringify({ hook_event_name: 'Stop' }),
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' }),
    JSON.stringify({ hook_event_name: 'constructor' }),
    JSON.stringify({ hook_event_name: 'toString' }),
    JSON.stringify({ hook_event_name: '__proto__' }),
    JSON.stringify({ source: 'startup' }),
    JSON.stringify([{ hook_event_name: 'SessionStart' }]),
    '5',
    'null',
    '{ not json',
    '',
  ];
  for (const input of inputs) silent(run(input), input);
});

test('decide: an output object for the two start events, null for the rest', () => {
  assert.deepEqual(decide({ hook_event_name: 'SessionStart', source: 'compact' }),
    { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: CONTEXT } });
  assert.deepEqual(decide({ hook_event_name: 'SubagentStart' }),
    { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: CONTEXT } });
  for (const x of [null, 5, 'SessionStart', [], {}, { hook_event_name: 'Stop' }, { hook_event_name: 'constructor' },
    { hook_event_name: 'hasOwnProperty' }, { hook_event_name: 'sessionstart' }]) {
    assert.equal(decide(x), null, JSON.stringify(x));
  }
});

test("RULES.md is the hook's RULESET plus one final newline", () => {
  assert.equal(readFileSync(repo('skills', 'planning', 'lazy-senior', 'RULES.md'), 'utf8'), RULESET + '\n');
});

test('the ruleset opens for code work, holds the fixed block, and keeps to its size and characters', () => {
  assert.ok(RULESET.startsWith('When you write or change code'));
  const block = [
    'Before you write code, stop at the first of these that does the whole job:',
    '1. It does not need to exist: leave out what nobody asked for, and say in one line what you left out.',
    '2. This codebase already does it: use that, the way the code around it does.',
    '3. The standard library or the platform does it, unless the project has its own.',
    '4. An installed dependency does it. Never add a dependency for a few lines.',
    '5. One line that a reader understands at a glance.',
    '6. Otherwise, the least code that works.',
    'Be lazy about the solution, never about the change: read the code it touches, list every caller, test, fixture, ' +
      'config and export it must reach, and finish all of them.',
    'On a bug fix, before you edit, search for every caller of the function you touch, then fix the cause once in the ' +
      'shared code.',
    'Never cut validation at a trust boundary, error handling that prevents data loss, security, accessibility, the ' +
      'calibration real hardware needs, or anything the user asked for.',
  ].join('\n');
  assert.ok(RULESET.includes(block), 'the fixed block, word for word');
  assert.ok(RULESET.length <= 1650, `RULESET is ${RULESET.length} characters`);
  assert.ok(CONTEXT.length <= 1800, `additionalContext is ${CONTEXT.length} characters`);
  assert.match(RULESET, /^[\x20-\x7e\n]+$/);
  assert.match(SIGNATURE, /^[\x20-\x7e]+$/);
});

test('the ruleset asks for a test of the edge cases on new logic and on every bug fix, and yields to the project', () => {
  const lines = RULESET.split('\n');
  const testLine = lines.find((l) => /small test/.test(l));
  assert.ok(testLine, 'a line asks for a small test');
  assert.match(testLine, /^Non-trivial logic and every bug fix /);
  assert.match(testLine, /edge cases they turn on/);
  assert.equal(lines.at(-1), "The project's instructions and the task's output format come first.");
});

// From docs/backlog/q33.md, item 4: a new file needs a reason, and size alone is not one. Not a rule against new files.
const NEW_FILE_RULE = 'A new file needs a reason, such as a new responsibility or a public interface, never size alone: ' +
  'extend the nearest existing file first, code that changes together stays together, and a file you split says in one ' +
  'line where its parts went.';

const FORBIDS_NEW_FILES = /\b(never|do not|don't|avoid|no)\b[^.:;,]{0,24}\bnew files?\b/i;

test('the ruleset says a new file needs a reason, after "Add no layer" and before the test line', () => {
  const lines = RULESET.split('\n');
  assert.equal(lines.filter((l) => l === NEW_FILE_RULE).length, 1, 'exactly one line is the new-file rule');
  const at = lines.indexOf(NEW_FILE_RULE);
  assert.ok(lines[at - 1].startsWith('Add no layer'), 'right after the "Add no layer" line');
  assert.ok(lines.findIndex((l) => l.startsWith('Non-trivial logic')) > at, 'before the "Non-trivial logic" line');
});

test('no ruleset line forbids new files', () => {
  for (const line of RULESET.split('\n')) {
    assert.doesNotMatch(line, FORBIDS_NEW_FILES);
  }
});

test("BUILD.md's Finish the change section says a new file needs a reason", () => {
  const build = readFileSync(repo('skills', 'planning', 'lazy-senior', 'BUILD.md'), 'utf8');
  const section = build.split(/^## /m).find((s) => s.startsWith('Finish the change\n'));
  assert.ok(section, 'a "## Finish the change" section');
  assert.match(section, /^- A new file needs a reason/m);
  const bullet = section.split(/^(?=- )/m).find((b) => b.startsWith('- A new file needs a reason'));
  assert.match(bullet.replace(/\s+/g, ' '), /Size alone is not one\./);
  assert.doesNotMatch(bullet.replace(/\s+/g, ' '), FORBIDS_NEW_FILES, 'the bullet does not forbid new files');
  // The skill works without the hooks, so BUILD.md names neither the guard nor its option.
  assert.doesNotMatch(build, /file-size-guard/);
  assert.doesNotMatch(build, /pathLimits/);
});

test("REVIEW.md's Lean list says a new file needs a reason, for review and audit alike", () => {
  const review = readFileSync(repo('skills', 'planning', 'lazy-senior', 'REVIEW.md'), 'utf8');
  const look = review.split(/^## /m).find((s) => s.startsWith('2. Look for\n'));
  assert.ok(look, 'a "## 2. Look for" section');
  const lean = look.split(/^\d+\. /m).find((s) => s.startsWith('**Lean:**'));
  assert.ok(lean, 'a "**Lean:**" item');
  const bullet = lean.split(/^(?=\s*- )/m).find((b) => /^\s*- New file:/.test(b));
  assert.ok(bullet, 'a "- New file:" bullet in the Lean list');
  const text = bullet.replace(/\s+/g, ' ');
  assert.match(text, /a new responsibility or a public interface/);
  assert.match(text, /extending the nearest existing file would do/);
  assert.match(text, /code that changes together spread over several files/);
  assert.match(text, /where its parts went/);
  assert.match(text, /Size alone is not a reason for a new file\./);
  assert.doesNotMatch(text, FORBIDS_NEW_FILES, 'the bullet does not forbid new files');
  assert.match(lean, /Split by job, never by line count\./, 'the Split bullet stays');
  // The skill works without the hooks, so REVIEW.md names neither the guard nor its option.
  assert.doesNotMatch(review, /file-size-guard|pathLimits/);
});

test('the signing line names both off switches exactly', () => {
  assert.equal(SIGNATURE, '(lazy-senior hook. Turn it off with "hooks": {"lazy-senior": false} in .claude/pau-skills.json, ' +
    'or PAU_SKILLS_DISABLE=lazy-senior.)');
});

test('hooks.json registers the hook for SessionStart (four sources) and SubagentStart, and nothing else', () => {
  const hook = { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/planning/lazy-senior.mjs"', timeout: 5 };
  assert.deepEqual(JSON.parse(readFileSync(repo('hooks', 'planning', 'hooks.json'), 'utf8')), {
    hooks: {
      SessionStart: [{ matcher: 'startup|resume|clear|compact', hooks: [hook] }],
      SubagentStart: [{ hooks: [hook] }],
    },
  });
});
