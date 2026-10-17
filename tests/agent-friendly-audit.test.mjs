// The agent-friendly-audit miner: fix and revert commits with the files they touched, the user's own messages from
// one project's Claude Code transcripts, and the transcript folders that belong to a repository. Every git repository
// is built in a temporary folder at test time; the transcript fixture is synthetic.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { redact, classify, encodeProjectPath } from '../skills/planning/agent-friendly-audit/mine.mjs';

const SCRIPT = repo('skills', 'planning', 'agent-friendly-audit', 'mine.mjs');
const FIXTURE = repo('tests', 'fixtures', 'agent-friendly-audit', 'projects');
const PROJECT = join(FIXTURE, '-work-shop');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function commit(dir, subject, files, body = '') {
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', subject, ...(body ? ['-m', body] : []));
  return git(dir, 'rev-parse', 'HEAD');
}

// A small history with every kind of commit the miner has to tell apart.
function history() {
  const dir = join(tempDir('afa-git-'), 'repo');
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Someone');
  git(dir, 'config', 'user.email', 'someone@example.org');
  git(dir, 'config', 'commit.gpgsign', 'false');
  commit(dir, 'Add parser', { 'src/parser.py': 'v1\n' });
  commit(dir, 'Fix empty input in parser', { 'src/parser.py': 'v2\n', 'tests/test_parser.py': 't1\n' });
  commit(dir, 'Add bug-fix skill', { 'skills/bug-fix/SKILL.md': 's\n' });
  const cache = commit(dir, 'Add cache', { 'src/cache.py': 'c\n' });
  git(dir, 'revert', '--no-edit', cache);
  commit(dir, 'parser: fixes from review', { 'src/parser.py': 'v3\n' });
  commit(dir, 'fixup! Fix empty input in parser', { 'src/parser.py': 'v4\n' });
  commit(dir, 'Fix the contact form for dev@example.com', { 'src/form.py': 'f\n' });
  git(dir, 'checkout', '-q', '-b', 'side');
  commit(dir, 'Side work', { 'src/side.py': 's\n' });
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge branch fix-side', 'side');
  return { dir, cache };
}

describe('classify', () => {
  test('a fix, a revert and a fixup are told apart, and a skill named bug-fix is not a fix', () => {
    assert.equal(classify('Fix empty input', ''), 'fix');
    assert.equal(classify('parser: fixes from review', ''), 'fix');
    assert.equal(classify('Hotfix for the login page', ''), 'fix');
    assert.equal(classify('Revert "Add cache"', 'This reverts commit 1234567.'), 'revert');
    assert.equal(classify('Undo the cache', 'This reverts commit 1234567.'), 'revert');
    assert.equal(classify('fixup! Add parser', ''), 'fixup');
    assert.equal(classify('Add bug-fix skill', ''), null);
    assert.equal(classify('Add a prefix helper', ''), null);
    assert.equal(classify('Rename fix-ups folder', ''), null);
    assert.equal(classify('Update the bug-fix skill wording', ''), null);
    // A subject that adds something new names "fix" as a topic, not as a correction.
    assert.equal(classify('Add flaky-test-hunt: find why a test fails, and prove the fix', ''), null);
    assert.equal(classify('Create a fix-it checklist and fix the docs', ''), null);
  });
});

describe('redact', () => {
  test('emails, token shapes, key values and home paths are hidden', () => {
    const home = join('/', 'srv', 'people', 'ana');
    const token = 'gh' + 'p_' + 'A1b2'.repeat(9);
    const text = [
      'mail ana@example.com now',
      `token ${token} here`,
      'password=hunter2hunter2',
      `open ${home}/src/app.py`,
      `and ${join('/', 'home', 'bob')}/notes.txt`,
      `and ${['C:', 'Users', 'carl', 'x.txt'].join('\\')}`,
    ].join('\n');
    const out = redact(text, home);
    assert.doesNotMatch(out, /@/);
    assert.doesNotMatch(out, /A1b2A1b2/);
    assert.doesNotMatch(out, /hunter2/);
    assert.doesNotMatch(out, /ana|bob|carl/);
    assert.match(out, /~\/src\/app\.py/);
    assert.match(out, /~\/notes\.txt/);
    assert.match(out, /password=\[secret\]/);
  });

  // Each secret is built at run time, so no file in the repository holds a secret-shaped string.
  const SECRETS = {
    'GITHUB_TOKEN=': 'abc123' + 'Q'.repeat(20),
    'OPENAI_API_KEY=': 'xyz' + 'W'.repeat(24),
    'DB_PASSWORD=': 'hunter' + '2',
    'AWS_SECRET_ACCESS_KEY=': 'wJalr' + 'X'.repeat(30),
    '{"password": "': 'pw12' + '3456' + '"}',
    'Authorization: Bearer ': 'abcdef' + 'Z'.repeat(20),
    'gitlab ': 'glp' + 'at-' + 'R'.repeat(20),
    'google ': 'AI' + 'za' + 'S'.repeat(35),
    'npm ': 'np' + 'm_' + 'T'.repeat(36),
    'url postgres://app:': 'pw' + 'Secret9' + '@localhost:5432/db',
  };

  for (const [prefix, secret] of Object.entries(SECRETS)) {
    test(`hides the secret in ${JSON.stringify(prefix.trim())}`, () => {
      const value = secret.replace(/["}]+$/, '').replace(/@.*$/, '');
      const out = redact(`${prefix}${secret}`, '/nowhere');
      assert.ok(!out.includes(value), `${out} still shows ${value}`);
      assert.match(out, /\[secret\]/);
    });
  }

  test('secrets are hidden end to end through transcripts', () => {
    const dir = join(tempDir('afa-sec-'), '-s-t');
    mkdirSync(dir);
    const lines = Object.entries(SECRETS).map(([prefix, secret], i) => JSON.stringify(
      { type: 'user', timestamp: `2026-04-02T00:00:0${i}Z`, message: { role: 'user', content: `${prefix}${secret}` } }));
    writeFileSync(join(dir, 's.jsonl'), lines.join('\n') + '\n');
    const r = runNode(SCRIPT, { args: ['transcripts', dir] });
    assert.equal(r.code, 0, r.stderr);
    for (const secret of Object.values(SECRETS)) {
      const value = secret.replace(/["}]+$/, '').replace(/@.*$/, '');
      assert.ok(!r.stdout.includes(value), `transcripts printed ${value}`);
    }
  });

  test('redaction stays fast on long input (no quadratic regular expression)', () => {
    const inputs = ['a'.repeat(200000), 'a.'.repeat(100000), 'x_'.repeat(100000) + '=', ('ab' + '-'.repeat(5)).repeat(30000) + '@'];
    for (const text of inputs) {
      const start = Date.now();
      redact(text, '/nowhere');
      assert.ok(Date.now() - start < 1500, `took ${Date.now() - start} ms on ${text.slice(0, 12)}...`);
    }
  });

  test('a 5 MB message is cut and printed quickly', () => {
    const dir = join(tempDir('afa-big-'), '-b-c');
    mkdirSync(dir);
    const big = { type: 'user', timestamp: '2026-04-03T00:00:00Z', message: { role: 'user', content: 'a'.repeat(5 * 1024 * 1024) } };
    writeFileSync(join(dir, 's.jsonl'), JSON.stringify(big) + '\n');
    const start = Date.now();
    const r = runNode(SCRIPT, { args: ['transcripts', dir] });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(Date.now() - start < 5000, `took ${Date.now() - start} ms`);
    assert.ok(r.stdout.split('\n').find((l) => l.startsWith('1\t')).length < 450);
  });
});

describe('commits', () => {
  test('lists fix, revert and fixup commits with their files, skips merges, and never prints an email', () => {
    const { dir, cache } = history();
    const r = runNode(SCRIPT, { args: ['commits', '--repo', dir] });
    assert.equal(r.code, 0, r.stderr);
    const subjects = r.stdout.split('\n').filter((l) => /^[0-9a-f]{7,}\t/.test(l)).map((l) => l.split('\t').slice(2).join('\t'));
    assert.deepEqual(subjects, [
      'fix\tFix the contact form for [email]',
      'fixup\tfixup! Fix empty input in parser',
      'fix\tparser: fixes from review',
      `revert\tRevert "Add cache" (reverts ${cache.slice(0, 7)})`,
      'fix\tFix empty input in parser',
    ]);
    assert.doesNotMatch(r.stdout, /@/);
    assert.doesNotMatch(r.stdout, /bug-fix|Side work|Merge branch/);
    assert.match(r.stdout, /\n\tsrc\/cache\.py\n/);
    assert.match(r.stdout, /# 3 fix, 1 revert, 1 fixup in 9 commits \(merges skipped\)/);
    assert.match(r.stdout, /# 3\tsrc\/parser\.py/);
    assert.doesNotMatch(r.stdout, /# 1\t/, 'a file touched once is not a hot spot');
  });

  test('--json gives the same commits as data', () => {
    const { dir, cache } = history();
    const r = runNode(SCRIPT, { args: ['commits', '--repo', dir, '--json'] });
    assert.equal(r.code, 0, r.stderr);
    const data = JSON.parse(r.stdout);
    assert.equal(data.scanned, 9);
    assert.deepEqual(data.commits.map((c) => c.kind), ['fix', 'fixup', 'fix', 'revert', 'fix']);
    const revert = data.commits.find((c) => c.kind === 'revert');
    assert.equal(revert.reverts, cache);
    assert.deepEqual(revert.files, ['src/cache.py']);
    assert.deepEqual(data.hotFiles, [{ file: 'src/parser.py', count: 3 }]);
    assert.doesNotMatch(r.stdout, /@/);
  });

  test('a folder that is not a git repository is refused', () => {
    const r = runNode(SCRIPT, { args: ['commits', '--repo', tempDir('afa-nogit-')] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /not a git repository/);
  });
});

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
    ]);
    assert.match(r.stdout, /^## 0a1b2c3d-0000-4000-8000-000000000001\.jsonl$/m);
    assert.match(r.stdout, /# 8 user messages in 2 sessions; skipped 1 subagent transcript and 1 unreadable line/);
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
    const rows = r.stdout.split('\n').filter((l) => l.includes(projects));
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
