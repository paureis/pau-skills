// The rule-to-hook templates work as shipped: the JS guard denies its example pattern, passes harmless and near-miss
// commands, fails open on garbage; its bundled test template is green; the Python twin agrees; the snippet is valid.
// The ratchet template passes at its baseline count, fails when a change adds one or drops one, and fails on an
// expired or incomplete exception.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { check, decide, splitCommands } from '../skills/guards/rule-to-hook/templates/pretooluse-guard.mjs';

const DIR = repo('skills', 'guards', 'rule-to-hook', 'templates');
const GUARD = repo('skills', 'guards', 'rule-to-hook', 'templates', 'pretooluse-guard.mjs');
const PY = repo('skills', 'guards', 'rule-to-hook', 'templates', 'pretooluse-guard.py');

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
  const s = JSON.parse(readFileSync(repo('skills', 'guards', 'rule-to-hook', 'templates', 'settings-snippet.json'), 'utf8'));
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

describe('ratchet template', () => {
  const RATCHET = repo('skills', 'guards', 'rule-to-hook', 'templates', 'ratchet.mjs');
  const ARGS = ['--id', 'no-env-read', '--pattern', 'os\\.environ|process\\.env', '--files', '**/*.py', '--files', 'src/**/*.js',
    '--instead', 'config.load() from app/config', '--baseline', 'env-baseline.txt', '--today', '2026-10-17'];
  const write = (dir, files) => {
    for (const [p, c] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), c);
    }
  };
  // Three counted lines: two in app.py (one line with two matches counts once), one in src/b.js. The Markdown file is
  // outside the globs, ignored/c.py is git-ignored, tools/d.js is outside src/.
  const project = (extra = {}) => {
    const dir = tempDir('ratchet-');
    spawnSync('git', ['init', '-q'], { cwd: dir });
    write(dir, {
      '.gitignore': 'ignored/\n',
      'app.py': 'import os\na = os.environ["A"] + os.environ["B"]\nb = os.environ.get("C")\nprint(a, b)\n',
      'src/b.js': 'const x = process.env.X;\nexport default x;\n',
      'docs/notes.md': 'Do not read process.env directly.\n',
      'ignored/c.py': 'import os\nos.environ["D"]\n',
      'tools/d.js': 'console.log(process.env.E);\n',
      'env-baseline.txt': '3\n',
      ...extra,
    });
    spawnSync('git', ['add', '-A'], { cwd: dir });
    return dir;
  };
  const ratchet = (cwd, extra = []) => runNode(RATCHET, { cwd, args: [...ARGS, ...extra] });
  const baseline = (dir) => readFileSync(join(dir, 'env-baseline.txt'), 'utf8').trim();

  test('passes at the baseline count, counting only tracked or untracked files inside the globs', () => {
    const r = ratchet(project());
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /no-env-read: 3\b/);
  });
  test('fails when a change adds one, naming what to use instead and where the matches are', () => {
    const dir = project();
    write(dir, { 'src/new/e.js': 'export const y = process.env.Y;\n' }); // untracked, still counted
    const r = ratchet(dir);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Use config\.load\(\) from app\/config instead/);
    assert.match(r.stderr, /src\/new\/e\.js:1/);
    assert.match(r.stderr, /\b4\b[^\n]*\b3\b/);
  });
  test('fails when the count drops and asks for the baseline to be lowered; --update lowers it', () => {
    const dir = project({ 'src/b.js': 'export default 1;\n' });
    const r = ratchet(dir);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /lower the baseline/i);
    const u = ratchet(dir, ['--update']);
    assert.equal(u.code, 0, u.stderr);
    assert.equal(baseline(dir), '2');
    assert.equal(ratchet(dir).code, 0);
  });
  test('--update never raises the baseline', () => {
    const dir = project({ 'src/f.js': 'process.env.F;\n' });
    const r = ratchet(dir, ['--update']);
    assert.equal(r.code, 1);
    assert.equal(baseline(dir), '3');
  });
  test('a missing baseline fails until --update writes the current count', () => {
    const dir = project();
    rmSync(join(dir, 'env-baseline.txt'));
    const r = ratchet(dir);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--update/);
    assert.equal(ratchet(dir, ['--update']).code, 0);
    assert.equal(baseline(dir), '3');
  });
  test('a valid exception on the offending line is not counted; another check\'s exception is', () => {
    const ok = ' # no-env-read: allowed until 2026-12-31, legacy loader until the config move, approved by @org/platform';
    const other = ' # other-check: allowed until 2026-12-31, some reason, approved by @org/platform';
    const dir = project({ 'app.py': `import os\na = os.environ["A"]${ok}\nb = os.environ.get("C")${other}\n` });
    const r = ratchet(dir, ['--update']);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(baseline(dir), '2');
  });
  test('an exception is valid through its last day and fails the day after, whatever the count', () => {
    const line = 'a = os.environ["A"]  # no-env-read: allowed until 2026-10-17, legacy, approved by @org/platform\n';
    const dir = project({ 'app.py': line, 'src/b.js': '', 'env-baseline.txt': '0\n' });
    assert.equal(ratchet(dir).code, 0);
    const r = ratchet(dir, ['--today', '2026-10-18']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /app\.py:1/);
    assert.match(r.stderr, /expired/);
  });
  test('an incomplete exception fails', () => {
    for (const tail of ['allowed until 2026-12-31, legacy', 'allowed until 2026-12-31, approved by @org/platform',
      'allowed until soon, legacy, approved by @org/platform', 'allowed until 2026-13-40, legacy, approved by @org/platform',
      'allowed, legacy, approved by @org/platform']) {
      const dir = project({ 'app.py': `a = os.environ["A"]  # no-env-read: ${tail}\n`, 'env-baseline.txt': '1\n' });
      const r = ratchet(dir);
      assert.equal(r.code, 1, tail);
      assert.match(r.stderr, /incomplete/, tail);
    }
  });
  test('usage errors exit 2', () => {
    const dir = project();
    const without = (flag) => { const i = ARGS.indexOf(flag); return [...ARGS.slice(0, i), ...ARGS.slice(i + 2)]; };
    for (const flag of ['--id', '--pattern', '--files', '--instead', '--baseline']) {
      const args = flag === '--files' ? without('--files').filter((a, i, all) => !(a === '--files' || all[i - 1] === '--files')) : without(flag);
      assert.equal(runNode(RATCHET, { cwd: dir, args }).code, 2, flag);
    }
    assert.equal(ratchet(dir, ['--pattern', '(']).code, 2);
    assert.equal(ratchet(dir, ['--today', 'tomorrow']).code, 2);
    // The ceiling stops git from finding a repository above the temporary folder.
    const d = tempDir('ratchet-nogit-');
    assert.equal(runNode(RATCHET, { cwd: d, args: ARGS, env: { GIT_CEILING_DIRECTORIES: dirname(realpathSync(d)) } }).code, 2);
  });

  // ARGS with each given flag's value replaced (all --files values replaced by the given list).
  const withArgs = ({ files, ...flags }) => {
    const out = [];
    for (let i = 0; i < ARGS.length; i += 2) {
      const k = ARGS[i].slice(2);
      if (k === 'files') continue;
      out.push(ARGS[i], k in flags ? flags[k] : ARGS[i + 1]);
    }
    for (const f of files ?? ['**/*.py', 'src/**/*.js']) out.push('--files', f);
    return out;
  };
  const exc = (tail) => `a = os.environ["A"]  # ${tail}\n`;

  test('works from a subfolder: globs and --baseline are relative to the repository root', () => {
    const dir = project({ 'sub dir/x.txt': 'nothing\n' });
    const r = runNode(RATCHET, { cwd: join(dir, 'sub dir'), args: ARGS });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /no-env-read: 3\b/);
    const lowered = project({ 'sub dir/x.txt': 'nothing\n', 'src/b.js': '' });
    assert.equal(runNode(RATCHET, { cwd: join(lowered, 'sub dir'), args: [...ARGS, '--update'] }).code, 0);
    assert.equal(baseline(lowered), '2');
  });
  test('globs that match no file are a usage error, not a baseline of 0', () => {
    const dir = project();
    const r = runNode(RATCHET, { cwd: dir, args: [...withArgs({ files: ['*.rb'] }), '--update'] });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /no file/i);
    assert.equal(baseline(dir), '3');
  });
  test('the exception id has a left boundary: no-env-read does not excuse env-read', () => {
    const dir = project({ 'app.py': exc('no-env-read: allowed until 2026-12-31, legacy, approved by @org/platform') });
    const r = runNode(RATCHET, { cwd: dir, args: [...withArgs({ id: 'env-read' }), '--update'] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(baseline(dir), '2');
  });
  test('an approver must start with a letter, a digit or @', () => {
    for (const who of ['*/', '-->', '#']) {
      const dir = project({ 'app.py': exc(`no-env-read: allowed until 2026-12-31, legacy, approved by ${who}`), 'env-baseline.txt': '1\n' });
      const r = ratchet(dir);
      assert.equal(r.code, 1, who);
      assert.match(r.stderr, /incomplete/, who);
    }
    const dir = project({ 'app.py': `x = 1  /* no-env-read: allowed until 2026-12-31, legacy, approved by @org/platform */\n`, 'env-baseline.txt': '1\n' });
    assert.equal(ratchet(dir).code, 0);
  });
  test('--update creates the folder of a new baseline file', () => {
    const dir = project();
    const r = runNode(RATCHET, { cwd: dir, args: [...withArgs({ baseline: '.ratchet/no-env-read.txt' }), '--update'] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(readFileSync(join(dir, '.ratchet', 'no-env-read.txt'), 'utf8').trim(), '3');
  });
  test('a --files value that starts with :( is passed to git as it is, so a file can be excluded', () => {
    const dir = project();
    const r = runNode(RATCHET, { cwd: dir, args: [...withArgs({ files: ['**/*.py', 'src/**/*.js', ':(exclude)app.py'] }), '--update'] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(baseline(dir), '1');
  });
  test('every valid exception is listed on each run, for a reviewer to check the approval', () => {
    const dir = project({ 'app.py': `import os\n${exc('no-env-read: allowed until 2026-12-31, legacy, approved by @org/platform')}`, 'env-baseline.txt': '1\n' });
    const r = ratchet(dir);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /app\.py:2[^\n]*2026-12-31[^\n]*@org\/platform/);
  });
  test('a baseline file that is not one whole number is a usage error', () => {
    assert.equal(ratchet(project({ 'env-baseline.txt': '2 junk\n' })).code, 2);
  });
  test('an exception dated on a day that does not exist is incomplete', () => {
    const dir = project({ 'app.py': exc('no-env-read: allowed until 2026-02-30, legacy, approved by @org/platform'), 'env-baseline.txt': '1\n' });
    const r = ratchet(dir, ['--today', '2026-01-01']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /incomplete/);
  });
});
