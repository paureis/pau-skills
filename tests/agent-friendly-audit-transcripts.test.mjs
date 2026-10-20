// The agent-friendly-audit miner's transcripts and folders commands: the user's own messages from one project's
// transcripts, and the transcript folders that belong to a repository, on the synthetic fixture and temporary folders.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tempDir } from './helpers.mjs';
import { encodeProjectPath } from '../skills/planning/agent-friendly-audit/mine.mjs';
import { SCRIPT, FIXTURE, PROJECT, git, commit, projectsFor } from './agent-friendly-audit.helpers.mjs';

describe('transcripts', () => {
  test('prints only what the user typed, in order, with a pointer to each line', () => {
    const r = runNode(SCRIPT, { args: ['transcripts', PROJECT] });
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /must not appear/);
    const rows = r.stdout.split('\n').filter((l) => /^\d+\t/.test(l));
    assert.deepEqual(rows, [
      '2\t2026-03-02\tAdd a --strict flag to the parser',
      '6\t2026-03-02\t/review the parser change',
      '8\t2026-03-02\tNo, use the shared config loader, not os.environ directly',
      '9\t2026-03-02\t[Request interrupted by user]',
      '12\t2026-03-02\t! git status',
      '14\t2026-03-02\t[image] Again: the config loader. This is the third time.',
      '1\t2026-03-05\tStop. Run the tests before you say done.',
      '4\t2026-03-05\t[Request interrupted by user for tool use]',
      '7\t2026-03-05\tKeep the changelog short',
    ]);
    assert.match(r.stdout, /^## -work-shop\/0a1b2c3d-0000-4000-8000-000000000001\.jsonl$/m);
    assert.match(r.stdout, /# 9 user messages in 2 sessions; skipped 1 subagent transcript and 1 unreadable line/);
  });

  test('refuses the folder that holds every project, so other projects are never read', () => {
    const r = runNode(SCRIPT, { args: ['transcripts', FIXTURE] });
    assert.equal(r.code, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /holds other project folders/);
  });

  test('refuses a folder that does not exist', () => {
    const r = runNode(SCRIPT, { args: ['transcripts', join(tempDir('afa-none-'), 'missing')] });
    assert.equal(r.code, 1);
    assert.equal(r.stdout, '');
  });

  test('hides emails, secrets and the home folder, and cuts long messages', () => {
    const home = tempDir('afa-home-');
    const dir = join(tempDir('afa-proj-'), '-x-y');
    mkdirSync(dir);
    const token = 'sk' + '-' + 'q9'.repeat(16);
    const long = 'word '.repeat(200).trim();
    const lines = [
      { type: 'user', timestamp: '2026-04-01T00:00:00Z', message: { role: 'user', content: `mail ana@example.com about ${home}/app/main.go` } },
      { type: 'user', timestamp: '2026-04-01T00:00:01Z', message: { role: 'user', content: `use key ${token}` } },
      { type: 'user', timestamp: '2026-04-01T00:00:02Z', message: { role: 'user', content: long } },
    ];
    writeFileSync(join(dir, 's.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const r = runNode(SCRIPT, { args: ['transcripts', dir, '--max-chars', '40'], env: { HOME: home, USERPROFILE: home } });
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /@/);
    assert.doesNotMatch(r.stdout, /q9q9q9/);
    assert.ok(!r.stdout.includes(home), 'the home folder is shown as ~');
    assert.match(r.stdout, /~\/app\/main\.go/);
    const longRow = r.stdout.split('\n').find((l) => l.startsWith('3\t'));
    assert.ok(longRow.split('\t')[2].length <= 43, longRow);
    assert.match(longRow, /\.\.\.$/);
  });
});

describe('folders', () => {
  test('lists the transcript folders of the repository and its worktrees, and nothing else', () => {
    const base = tempDir('afa-wt-');
    const main = join(base, 'app');
    mkdirSync(main);
    git(main, 'init', '-q', '-b', 'main');
    git(main, 'config', 'user.name', 'Someone');
    git(main, 'config', 'user.email', 'someone@example.org');
    git(main, 'config', 'commit.gpgsign', 'false');
    commit(main, 'Start', { 'a.txt': 'a\n' });
    git(main, 'worktree', 'add', '-q', join(base, 'app-wt'), '-b', 'wt');
    const projects = tempDir('afa-projects-');
    const paths = [realpathSync(main), realpathSync(join(base, 'app-wt'))];
    for (const p of paths) mkdirSync(join(projects, encodeProjectPath(p), 's1', 'subagents'), { recursive: true });
    writeFileSync(join(projects, encodeProjectPath(paths[0]), 's1.jsonl'), '{}\n');
    writeFileSync(join(projects, encodeProjectPath(paths[0]), 's1', 'subagents', 'agent-1.jsonl'), '{}\n');
    mkdirSync(join(projects, encodeProjectPath(paths[0]) + '-old'));
    mkdirSync(join(projects, '-somewhere-else'));
    const r = runNode(SCRIPT, { args: ['folders', '--repo', main, '--projects', projects] });
    assert.equal(r.code, 0, r.stderr);
    const rows = r.stdout.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    assert.equal(rows.length, 2, r.stdout);
    assert.match(rows[0], /1 session, 1 subagent transcript/);
    assert.match(rows[1], /0 sessions, 0 subagent transcripts/);
    assert.doesNotMatch(r.stdout, /-old|somewhere-else/);
  });

  test('says so when no folder matches, instead of guessing', () => {
    const main = join(tempDir('afa-nomatch-'), 'app');
    mkdirSync(main);
    git(main, 'init', '-q', '-b', 'main');
    const r = runNode(SCRIPT, { args: ['folders', '--repo', main, '--projects', tempDir('afa-empty-')] });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /No transcript folder matches/);
  });

  test('the folder name is the absolute path with every character that is not a letter or digit made a dash', () => {
    assert.equal(encodeProjectPath('/srv/dev/my_app.v2'), '-srv-dev-my-app-v2');
    assert.equal(encodeProjectPath('C:\\src\\app'), 'C--src-app');
  });
});

describe('transcripts read only this repository', () => {
  test('another project folder, the projects folder itself, or a glob over it is refused', () => {
    const { main, projects, own, other, env } = projectsFor();
    for (const args of [[other], [projects], [own, other]]) {
      const r = runNode(SCRIPT, { args: ['transcripts', ...args, '--repo', main], env });
      assert.equal(r.code, 1, `${args}: ${r.stdout}`);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /not a transcript folder of this repository|holds other project folders/);
    }
  });

  test('with no folder, it reads the folders of this repository, leaves out the live session, and hides home', () => {
    const { home, main, env } = projectsFor();
    const r = runNode(SCRIPT, { args: ['transcripts', '--repo', main], env });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /own old session/);
    assert.doesNotMatch(r.stdout, /own live session|must not appear/);
    assert.match(r.stdout, /^## ~-src-app\/old\.jsonl$/m);
    assert.ok(!r.stdout.includes(encodeProjectPath(home)), r.stdout);
    assert.match(r.stdout, /left out 1 recent session/);
  });

  test('--keep-recent reads the live session too, and --skip leaves out a named one', () => {
    const { main, env } = projectsFor();
    const keep = runNode(SCRIPT, { args: ['transcripts', '--repo', main, '--keep-recent'], env });
    assert.equal(keep.code, 0, keep.stderr);
    assert.match(keep.stdout, /own live session/);
    const skip = runNode(SCRIPT, { args: ['transcripts', '--repo', main, '--keep-recent', '--skip', 'old'], env });
    assert.equal(skip.code, 0, skip.stderr);
    assert.doesNotMatch(skip.stdout, /own old session/);
    assert.match(skip.stdout, /own live session/);
  });

  test('its own folder, named explicitly, is accepted', () => {
    const { main, own, env } = projectsFor();
    const r = runNode(SCRIPT, { args: ['transcripts', own, '--repo', main], env });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /own old session/);
  });

  test('folders shows the folder name with the home part as ~', () => {
    const { home, main, env } = projectsFor();
    const r = runNode(SCRIPT, { args: ['folders', '--repo', main], env });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /~-src-app/);
    assert.ok(!r.stdout.includes(encodeProjectPath(home)), r.stdout);
    assert.ok(!r.stdout.includes(home), r.stdout);
  });
});
