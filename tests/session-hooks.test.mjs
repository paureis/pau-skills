// branch-context summarises git state at session start; compact-snapshot saves facts before a compaction and prints
// them when the compacted session resumes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { plugin, runNode, tempDir } from './helpers.mjs';
import { summarize, gather } from '../plugins/session-discipline/scripts/branch-context.mjs';
import { extract, render, writeSnapshot, latestSnapshot } from '../plugins/session-discipline/scripts/compact-snapshot.mjs';

const BRANCH = plugin('session-discipline', 'scripts', 'branch-context.mjs');
const SNAP = plugin('session-discipline', 'scripts', 'compact-snapshot.mjs');
const env = () => ({ PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '' });

function repo() {
  const dir = tempDir();
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 'a@example.com'); g('config', 'user.name', 'a');
  writeFileSync(join(dir, 'a.txt'), '1'); g('add', '.'); g('commit', '-qm', 'first commit');
  return { dir, g };
}

describe('branch-context', () => {
  const base = { branch: 'feature/x', head: 'abc123 msg (2 hours ago)', upstream: 'origin/feature/x', ahead: 0, behind: 0, changed: 0, untracked: 0, conflicted: 0, stashes: 0, inProgress: [] };
  test('a clean, up-to-date feature branch', () => {
    const t = summarize(base);
    assert.match(t, /on branch feature\/x/); assert.match(t, /up to date/); assert.match(t, /Working tree: clean/);
    assert.doesNotMatch(t, /WARNING|NOTE/);
  });
  test('warns about a protected branch, a dirty tree, an unfinished rebase and being behind', () => {
    const t = summarize({ ...base, branch: 'main', changed: 2, untracked: 1, stashes: 1, behind: 3, inProgress: ['a rebase'] });
    assert.match(t, /protected branch/); assert.match(t, /2 changed files, 1 untracked, 1 stash/);
    assert.match(t, /a rebase is in progress/); assert.match(t, /behind its upstream/);
  });
  test('detached HEAD and no upstream', () => {
    assert.match(summarize({ ...base, branch: '', upstream: '' }), /detached HEAD/);
    assert.match(summarize({ ...base, upstream: '' }), /No upstream/);
  });
  test('protectedBranches replaces the default list', () => {
    assert.doesNotMatch(summarize({ ...base, branch: 'main' }, ['prod']), /protected/);
  });
  test('gather returns null outside a repository', () => assert.equal(gather(() => null), null));
  test('as a hook in a real repository', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'b.txt'), 'new');
    const r = runNode(BRANCH, { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: dir }), env: env() });
    const text = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(text, /on branch main/); assert.match(text, /1 untracked/); assert.match(text, /first commit/); assert.match(text, /protected/);
  });
  test('silent outside a repository', () => {
    const r = runNode(BRANCH, { input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: tempDir() }), env: env() });
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
});

const entries = [
  { type: 'user', message: { content: 'Please add a CSV export to the reports page. Keep the column order.' } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/report.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'TodoWrite', input: { todos: [{ content: 'Export button', status: 'completed' }, { content: 'Large files', status: 'in_progress' }] } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'src/csv.ts' } }] } },
  { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/report.ts' } }] } },
  { type: 'user', message: { content: 'Also, no external libraries.' } },
];

describe('compact-snapshot', () => {
  test('extracts prompts, files (most recent last, no repeats), commands and todos', () => {
    const f = extract(entries);
    assert.deepEqual(f.prompts, ['Please add a CSV export to the reports page. Keep the column order.', 'Also, no external libraries.']);
    assert.deepEqual(f.files, ['src/csv.ts', 'src/report.ts']);
    assert.deepEqual(f.commands, ['npm test']);
    assert.equal(f.todos.length, 2);
  });
  test('renders markdown with every section', () => {
    const md = render(extract(entries), { when: '2026-01-01T00:00:00Z', trigger: 'auto', git: '## main' });
    for (const s of ['last messages', 'Files edited', 'Last shell commands', 'Todo list', '[x] Export button', 'Large files (in progress)', '## main']) assert.ok(md.includes(s), s);
  });
  test('writes into a git-ignored folder and keeps only the newest N', () => {
    const dir = join(tempDir(), 'snaps');
    const transcript = entries.map((e) => JSON.stringify(e)).join('\n');
    for (let i = 0; i < 4; i++) writeSnapshot({ dir, transcript, trigger: 'auto', git: '', now: new Date(Date.UTC(2026, 0, 1, 0, i)), keep: 2 });
    assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), '*\n');
    assert.equal(readdirSync(dir).filter((f) => f.endsWith('.md')).length, 2);
  });
  test('latestSnapshot ignores snapshots older than an hour', () => {
    const dir = join(tempDir(), 'snaps');
    const file = writeSnapshot({ dir, transcript: '', trigger: 'manual', git: '' });
    assert.ok(latestSnapshot(dir));
    const old = (Date.now() - 2 * 3600 * 1000) / 1000;
    utimesSync(file, old, old);
    assert.equal(latestSnapshot(dir), null);
  });
  test('as hooks: PreCompact writes, SessionStart(compact) reads back', () => {
    const project = tempDir();
    const tpath = join(project, 't.jsonl');
    writeFileSync(tpath, entries.map((e) => JSON.stringify(e)).join('\n'));
    const e = env();
    const w = runNode(SNAP, { input: JSON.stringify({ hook_event_name: 'PreCompact', trigger: 'auto', cwd: project, transcript_path: tpath }), env: e });
    assert.equal(w.code, 0); assert.equal(w.stdout, '');
    assert.ok(existsSync(join(project, '.claude', 'pau-skills', 'snapshots', '.gitignore')));
    const r = runNode(SNAP, { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'compact', cwd: project }), env: e });
    const text = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(text, /no external libraries/); assert.match(text, /src\/csv\.ts/);
    const startup = runNode(SNAP, { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: project }), env: e });
    assert.equal(startup.stdout, '');
  });
  test('odd input or a missing transcript never fails', () => {
    assert.equal(runNode(SNAP, { input: 'x' }).code, 0);
    assert.equal(runNode(SNAP, { input: JSON.stringify({ hook_event_name: 'PreCompact', cwd: tempDir(), transcript_path: '/nope' }), env: env() }).code, 0);
  });
});
