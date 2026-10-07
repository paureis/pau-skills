// The rule-to-hook templates work as shipped: the JS guard denies its example pattern, passes harmless and near-miss
// commands, fails open on garbage; its bundled test template is green; the Python twin agrees; the snippet is valid.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { plugin, runNode } from './helpers.mjs';
import { check, decide, splitCommands } from '../plugins/guards/skills/rule-to-hook/templates/pretooluse-guard.mjs';

const DIR = plugin('guards', 'skills', 'rule-to-hook', 'templates');
const GUARD = plugin('guards', 'skills', 'rule-to-hook', 'templates', 'pretooluse-guard.mjs');
const PY = plugin('guards', 'skills', 'rule-to-hook', 'templates', 'pretooluse-guard.py');

const hook = (command, tool = 'Bash') => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd: DIR });

const DENY = ['git add .', 'git add -A', 'git add --all', 'git add :/', 'git -C sub add .', 'FOO=1 git add -A',
  'make && git add . && git commit -m x', 'bash -c "git add ."', 'sh -c \'git add -A\'', 'git add --all --dry-run', '/usr/bin/git add .'];
const PASS = ['git add src/app.ts', 'git add ./src', 'git add .gitignore', 'git add -p', 'git status', 'echo "git add ."',
  "git commit -m 'never git add . again'", 'grep -rn "git add -A" docs', 'ls -A', 'git log --all', ''];

describe('JS guard: pure function', () => {
  for (const c of DENY) test(`denies ${c}`, () => assert.ok(check(c), c));
  for (const c of PASS) test(`passes ${JSON.stringify(c)}`, () => assert.equal(check(c), null, c));
  test('splitter keeps quoted text as one word and breaks on operators', () => {
    assert.deepEqual(splitCommands('echo "a && b" && git add x; ls'), [['echo', 'a && b'], ['git', 'add', 'x'], ['ls']]);
  });
  test('non-string commands are allowed', () => { for (const c of [undefined, null, 42, {}]) assert.equal(check(c), null); });
});

describe('JS guard: as a hook', () => {
  test('denies the example pattern with exit 2 and the reason on stderr', () => {
    const r = runNode(GUARD, { input: hook('git add -A') });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /no-blanket-git-add/);
    assert.equal(r.stdout, '');
  });
  test('passes harmless input silently', () => {
    const r = runNode(GUARD, { input: hook('git status') });
    assert.equal(r.code, 0);
    assert.equal(r.stdout + r.stderr, '');
  });
  test('fails open on garbage and on other tools', () => {
    for (const input of ['', 'garbage', '{', '[]', 'null', '42', JSON.stringify({ tool_name: 'Bash' }),
      JSON.stringify({ tool_name: 'Bash', tool_input: { command: 7 } }), hook('git add .', 'Write')]) {
      assert.equal(runNode(GUARD, { input }).code, 0, input);
    }
  });
  test('ask mode emits a PreToolUse permission decision', () => {
    const out = decide(JSON.parse(hook('git add .')), 'ask');
    assert.equal(out.code, 0);
    const json = JSON.parse(out.stdout);
    assert.equal(json.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(json.hookSpecificOutput.permissionDecision, 'ask');
  });
});

test('the bundled guard.test.mjs template passes against the bundled guard', () => {
  const r = spawnSync(process.execPath, ['--test', 'guard.test.mjs'], { cwd: DIR, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('settings snippet is valid JSON with a Bash PreToolUse command hook', () => {
  const s = JSON.parse(readFileSync(plugin('guards', 'skills', 'rule-to-hook', 'templates', 'settings-snippet.json'), 'utf8'));
  const entry = s.hooks.PreToolUse[0];
  assert.equal(entry.matcher, 'Bash');
  assert.equal(entry.hooks[0].type, 'command');
});

const python = ['python3', 'python'].find((p) => spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);
test('the Python template agrees with the JS one', { skip: python ? false : 'no python on PATH' }, () => {
  const run = (input) => spawnSync(python, [PY], { input, encoding: 'utf8' }).status;
  for (const c of DENY) assert.equal(run(hook(c)), 2, c);
  for (const c of PASS) assert.equal(run(hook(c)), 0, c);
  for (const g of ['', 'garbage', 'null', '[]', hook('git add "unbalanced')]) assert.equal(run(g), 0, g);
});
