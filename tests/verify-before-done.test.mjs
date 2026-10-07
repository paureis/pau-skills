// The verify-before-done Stop hook blocks once when code was edited since the user's last message and no check ran
// after the last edit.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { decide, assess, toolCallsSinceLastPrompt, parseTranscript, VERIFY } from '../hooks/verification/verify-before-done.mjs';

const HOOK = repo('hooks', 'verification', 'verify-before-done.mjs');

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const result = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name, input }] } });
const edit = (file_path) => tool('Edit', { file_path, old_string: 'a', new_string: 'b' });
const bash = (command) => tool('Bash', { command });
const jsonl = (entries) => entries.map((e) => JSON.stringify(e)).join('\n');

describe('verify-before-done: recognising checks', () => {
  for (const c of ['npm test', 'pnpm run lint', 'yarn build', 'npx vitest run', 'node --test tests/', 'pytest -q', 'python -m pytest',
    'uv run pytest', 'ruff check .', 'mypy src', 'cargo test', 'cargo clippy', 'go test ./...', 'go vet ./...', './gradlew test',
    'mvn -q verify', 'dotnet test', 'bundle exec rspec', 'rails test', 'vendor/bin/phpunit', 'mix test', 'swift test',
    'flutter test', 'make', 'make test', 'make -j4 check', 'just test', 'bazel test //...', 'tsc --noEmit', 'cd api && go build ./...']) {
    test(`counts: ${c}`, () => assert.ok(VERIFY.test(c), c));
  }
  for (const c of ['npm install', 'git status', 'ls -la', 'cat package.json', 'git commit -m "add tests"', 'echo testing', 'makefile-lint-free']) {
    test(`does not count: ${c}`, () => assert.equal(VERIFY.test(c), false, c));
  }
});

describe('verify-before-done: assessing the turn', () => {
  test('only tool calls after the last real user message count', () => {
    const entries = [user('first'), edit('a.js'), bash('npm test'), result(), user('second'), edit('b.js'), result()];
    assert.deepEqual(toolCallsSinceLastPrompt(entries).map((c) => c.name), ['Edit']);
  });
  test('edit then no check: not verified', () => {
    const r = assess(toolCallsSinceLastPrompt([user('go'), edit('src/a.py')]));
    assert.deepEqual(r, { edited: ['src/a.py'], verified: false });
  });
  test('edit then check: verified', () => {
    assert.equal(assess(toolCallsSinceLastPrompt([user('go'), edit('src/a.py'), bash('pytest')])).verified, true);
  });
  test('a check before the last edit does not count', () => {
    assert.equal(assess(toolCallsSinceLastPrompt([user('go'), edit('a.go'), bash('go test ./...'), edit('b.go')])).verified, false);
  });
  test('documentation edits never need verification', () => {
    assert.equal(assess(toolCallsSinceLastPrompt([user('go'), edit('README.md'), edit('docs/x.mdx')])).verified, true);
  });
  test('testCommands and ignorePaths options', () => {
    const calls = toolCallsSinceLastPrompt([user('go'), edit('src/a.c'), bash('./scripts/check-all')]);
    assert.equal(assess(calls).verified, false);
    assert.equal(assess(calls, { testCommands: ['scripts/check-all'] }).verified, true);
    assert.equal(assess(toolCallsSinceLastPrompt([user('go'), edit('yarn.lock')]), { ignorePaths: ['*.lock'] }).verified, true);
  });
  test('no edits: nothing to verify', () => {
    assert.equal(assess(toolCallsSinceLastPrompt([user('what does this do?'), bash('cat a.js')])).verified, true);
  });
  test('parseTranscript skips broken lines', () => {
    assert.equal(parseTranscript('{"a":1}\nnot json\n\n{"b":2}').length, 2);
  });
});

describe('verify-before-done: decide', () => {
  const unverified = jsonl([user('fix it'), edit('src/a.ts'), result()]);
  test('blocks with a reason that names the file', () => {
    const out = decide({ stop_hook_active: false }, { transcript: unverified });
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /a\.ts/);
  });
  test('never blocks twice in a row', () => assert.equal(decide({ stop_hook_active: true }, { transcript: unverified }), null));
});

describe('verify-before-done: as a hook', () => {
  test('reads the transcript file and prints the block decision', () => {
    const dir = tempDir();
    const path = join(dir, 't.jsonl');
    writeFileSync(path, jsonl([user('fix it'), edit('src/a.rs'), result()]));
    const env = { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '' };
    const r = runNode(HOOK, { input: JSON.stringify({ hook_event_name: 'Stop', cwd: dir, transcript_path: path, stop_hook_active: false }), env });
    assert.equal(r.code, 0);
    assert.equal(JSON.parse(r.stdout).decision, 'block');
    const off = runNode(HOOK, { input: JSON.stringify({ hook_event_name: 'Stop', cwd: dir, transcript_path: path }), env: { ...env, PAU_SKILLS_DISABLE: 'verify-before-done' } });
    assert.equal(off.stdout, '');
  });
  test('silent on a missing transcript or odd input', () => {
    assert.equal(runNode(HOOK, { input: JSON.stringify({ transcript_path: '/nope/x.jsonl' }) }).stdout, '');
    assert.equal(runNode(HOOK, { input: 'x' }).stdout, '');
  });
});
