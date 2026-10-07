// Template: tests for a PreToolUse guard, from the rule-to-hook skill. Copy it next to your guard, point GUARD at it,
// and replace the DENY and PASS tables with real examples of the rule being broken and real near-misses.
//
// Run: node --test path/to/guard.test.mjs        (Node.js 20+, no dependencies)
//
// Two layers on purpose:
//   1. The pure function, called directly: fast, one test per table row, the failure names the exact command.
//   2. The script as Claude Code runs it: spawned with hook JSON on stdin, checking exit code and output. This is what
//      catches a broken import, a crash on startup, or a guard that forgot to exit 2.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('./pretooluse-guard.mjs', import.meta.url));
const { check, decide } = await import(new URL('./pretooluse-guard.mjs', import.meta.url).href);

// Every command here breaks the rule. Take them from the transcripts and history where the rule was broken, then add
// the obvious variants (flags in another order, a prefix, a wrapper such as bash -c).
const DENY = [
  'git add .',
  'git add -A',
  'git add --all',
  'git add :/',
  'git -C packages/api add .',
  'FOO=1 git add -A',
  'npm test && git add . && git commit -m wip',
  'bash -c "git add ."',
  'git add --all --dry-run',
];

// Every command here must stay allowed. The near-misses matter most: they share words with the violation, and a
// guard that blocks them will be switched off within a week.
const PASS = [
  'git add src/app.ts',
  'git add ./src',
  'git add .gitignore',
  'git add -p',
  'git status',
  'echo "git add ."',
  "git commit -m 'never git add . again'",
  'grep -r "git add -A" docs',
  'ls -A',
];

const hookInput = (command, tool = 'Bash') =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd: process.cwd(), session_id: 'test', transcript_path: '' });

const run = (stdin) => spawnSync(process.execPath, [GUARD], { input: stdin, encoding: 'utf8' });

describe('pure function: denies', () => { for (const c of DENY) test(c, () => assert.ok(check(c), `expected a deny reason for: ${c}`)); });
describe('pure function: passes', () => { for (const c of PASS) test(c, () => assert.equal(check(c), null, `expected no reason for: ${c}`)); });

describe('as a hook', () => {
  test('a violation exits 2 with the reason on stderr', () => {
    const r = run(hookInput(DENY[0]));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Blocked/);
  });
  test('a harmless command exits 0 silently', () => {
    const r = run(hookInput(PASS[0]));
    assert.equal(r.status, 0);
    assert.equal(r.stdout + r.stderr, '');
  });
  test('fails open on input it does not understand', () => {
    for (const stdin of ['', 'not json', '[]', 'null', JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'x' } }), JSON.stringify({ tool_name: 'Bash' })]) {
      assert.equal(run(stdin).status, 0, `stdin: ${stdin}`);
    }
  });
  test("ask mode returns a permissionDecision instead of exit 2", () => {
    const out = decide(JSON.parse(hookInput(DENY[0])), 'ask');
    assert.equal(out.code, 0);
    assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, 'ask');
  });
});
