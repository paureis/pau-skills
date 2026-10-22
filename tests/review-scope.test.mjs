// The review-triage and lean-subagent-dev scope helper: globs, configuration and fix flags (pure), and the change
// and fix commands against a real repository.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  globToRegExp, anyMatch, validateConfig, resolveConfig, parseNumstat, classify, summarizeChange, fixFlags,
  parseArgs, DEFAULTS, MIN_FILES, BUDGET_ENV,
} from '../skills/verification/review-triage/review-scope.mjs';

const SCRIPT = repo('skills', 'verification', 'review-triage', 'review-scope.mjs');

describe('globs', () => {
  const cases = [
    ['src/*.ts', 'src/a.ts', true], ['src/*.ts', 'src/sub/a.ts', false], ['src/**', 'src/x/y.go', true],
    ['src/**/*.py', 'src/a.py', true], ['src/**/*.py', 'src/x/y/a.py', true], ['src/**/*.py', 'lib/a.py', false],
    ['src/{api,db}/**', 'src/db/q.sql', true], ['src/{api,db}/**', 'src/ui/q.tsx', false], ['src/?.rb', 'src/a.rb', true],
    ['docs/', 'docs/a/b.md', true], ['./core/decide', 'core/decide/pick.rs', true], ['core/decide', 'core/decider.rs', false],
    ['a.b', 'axb', false], ['src\\core\\*.cs', 'src/core/Pick.cs', true],
  ];
  for (const [g, p, want] of cases) test(`${g} vs ${p}`, () => assert.equal(globToRegExp(g).test(p), want));
  test('an unbalanced brace throws', () => assert.throws(() => globToRegExp('src/{a,b')));

  test('the default test globs find tests in the common ecosystems and leave code alone', () => {
    const isTest = anyMatch(DEFAULTS.testPaths);
    for (const p of ['tests/test_pick.py', 'pkg/pick_test.go', 'src/pick.test.ts', 'web/app.spec.js', 'spec/pick_spec.rb',
      'src/test/java/PickTest.java', 'Pick.Tests/PickTests.cs', 'crate/tests/pick.rs', 'app/__tests__/pick.jsx']) {
      assert.ok(isTest(p), p);
    }
    for (const p of ['src/pick.ts', 'pkg/pick.go', 'lib/contest.rb', 'src/Latest.java', 'README.md']) assert.equal(isTest(p), false, p);
  });
});

describe('configuration', () => {
  test('an empty config gives the defaults and the normal budget', () => {
    const r = resolveConfig({}, {});
    assert.deepEqual(r.errors, []);
    assert.equal(r.config.delegation.budget, 'normal');
    assert.equal(r.config.delegation.budgetFrom, 'default');
    assert.equal(r.config.delegation.minFiles, MIN_FILES.normal);
    assert.deepEqual(r.config.mustFix, DEFAULTS.mustFix);
  });

  test('the project must-fix list is added to the defaults; path lists replace them', () => {
    const r = resolveConfig({ mustFix: ['a command runs against the wrong account'], testPaths: ['checks/**'], riskyPaths: ['core/**'] }, {});
    assert.equal(r.config.mustFix.length, DEFAULTS.mustFix.length + 1);
    assert.equal(r.config.mustFix.at(-1), 'a command runs against the wrong account');
    assert.deepEqual(r.config.testPaths, ['checks/**']);
    assert.deepEqual(r.config.riskyPaths, ['core/**']);
  });

  test('the environment budget wins over the file, and the threshold follows the budget', () => {
    const r = resolveConfig({ delegation: { budget: 'generous' } }, { [BUDGET_ENV]: 'Tight' });
    assert.equal(r.config.delegation.budget, 'tight');
    assert.equal(r.config.delegation.budgetFrom, BUDGET_ENV);
    assert.equal(r.config.delegation.minFiles, MIN_FILES.tight);
    assert.ok(MIN_FILES.tight > MIN_FILES.normal && MIN_FILES.normal > MIN_FILES.generous);
  });

  test('an explicit minFiles wins over the budget default', () => {
    assert.equal(resolveConfig({ delegation: { budget: 'tight', minFiles: 4 } }, {}).config.delegation.minFiles, 4);
  });

  test('bad shapes, unknown keys and a bad budget are reported, each one', () => {
    assert.equal(validateConfig([]).length, 1);
    const errs = validateConfig({ riskyPath: ['x'], mustFix: 'no', testPaths: ['src/{a'], delegation: { budget: 'huge', minFiles: 0, extra: 1 } });
    for (const re of [/unknown key "riskyPath"/, /"mustFix" must be a list/, /brace/, /delegation\.budget/, /minFiles/, /delegation\.extra/]) {
      assert.ok(errs.some((e) => re.test(e)), `${re} in ${errs.join(' | ')}`);
    }
    const env = resolveConfig({}, { [BUDGET_ENV]: 'huge' });
    assert.equal(env.errors.length, 1);
    assert.match(env.errors[0], new RegExp(`^${BUDGET_ENV}`));
  });
});

describe('numstat and classification', () => {
  test('parses counts, binary files and paths with spaces', () => {
    const z = '3\t1\tsrc/a b.py\0-\t-\tlogo.png\0';
    assert.deepEqual(parseNumstat(z), [{ path: 'src/a b.py', added: 3, removed: 1 }, { path: 'logo.png', added: 0, removed: 0 }]);
  });

  test('a test file is never also a doc, and the summary splits code, tests and docs', () => {
    const { config } = resolveConfig({ riskyPaths: ['core/**'] }, {});
    const files = classify([
      { path: 'core/pick.py', added: 5, removed: 1 }, { path: 'tests/test_pick.py', added: 9, removed: 0 },
      { path: 'docs/usage.md', added: 2, removed: 2 }, { path: 'tests/README.md', added: 1, removed: 0 },
    ], config);
    const s = summarizeChange(files);
    assert.deepEqual(s.risky, ['core/pick.py']);
    assert.deepEqual(s.code, ['core/pick.py']);
    assert.deepEqual(s.tests, ['tests/test_pick.py', 'tests/README.md']);
    assert.deepEqual(s.docs, ['docs/usage.md']);
    assert.deepEqual([s.added, s.removed], [17, 3]);
  });
});

describe('fixFlags', () => {
  const { config } = resolveConfig({ riskyPaths: ['core/**'] }, {});
  const reviewed = ['src/msg.py', 'core/pick.py', 'tests/test_msg.py'];
  const f = (...paths) => classify(paths.map((path) => ({ path, added: 1, removed: 0 })), config);
  const ids = (flags) => flags.map((x) => x.id);

  test('a fix with its test, inside the change and outside risky code, raises nothing', () => {
    assert.deepEqual(fixFlags(f('src/msg.py', 'tests/test_msg.py'), reviewed), []);
  });
  test('a new test file is not outside the change', () => {
    assert.deepEqual(fixFlags(f('src/msg.py', 'tests/test_new.py'), reviewed), []);
  });
  test('code without a test raises NO_TEST', () => assert.deepEqual(ids(fixFlags(f('src/msg.py'), reviewed)), ['NO_TEST']));
  test('a deleted test does not count as the fix\'s test', () => {
    const files = f('src/msg.py', 'tests/test_msg.py').map((x) => (x.test ? { ...x, deleted: true } : x));
    assert.deepEqual(ids(fixFlags(files, reviewed)), ['NO_TEST']);
  });
  test('build and dependency files are code, not docs', () => {
    assert.deepEqual(ids(fixFlags(f('src/msg.py', 'tests/test_msg.py', 'CMakeLists.txt', 'requirements.txt'), [...reviewed, 'CMakeLists.txt'])), ['OUTSIDE']);
    assert.deepEqual(fixFlags(f('requirements.txt'), ['requirements.txt']).map((x) => x.id), ['NO_TEST']);
  });
  test('a doc-only fix needs no test and is never outside the change', () => {
    assert.deepEqual(fixFlags(f('docs/usage.md', 'README.md'), reviewed), []);
  });
  test('risky code raises RISKY', () => {
    const flags = fixFlags(f('core/pick.py', 'tests/test_pick.py'), reviewed);
    assert.deepEqual(ids(flags), ['RISKY']);
    assert.deepEqual(flags[0].paths, ['core/pick.py']);
  });
  test('code the review did not see raises OUTSIDE with only that path', () => {
    const flags = fixFlags(f('src/msg.py', 'src/other.py', 'tests/test_msg.py'), reviewed);
    assert.deepEqual(ids(flags), ['OUTSIDE']);
    assert.deepEqual(flags[0].paths, ['src/other.py']);
  });
  test('no change raises nothing', () => assert.deepEqual(fixFlags([], reviewed), []));
});

describe('parseArgs', () => {
  test('fix needs --since, and --since is only for fix', () => {
    assert.throws(() => parseArgs(['fix']), /--since/);
    assert.throws(() => parseArgs(['change', '--since', 'HEAD']), /only for fix/);
    assert.throws(() => parseArgs(['nope']), /command/);
    assert.equal(parseArgs(['fix', '--since', 'abc', '--json']).json, true);
  });
});

describe('against a real repository', () => {
  const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (dir, path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  const commit = (dir, msg) => { g(dir, 'add', '-A'); g(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', msg); return g(dir, 'rev-parse', 'HEAD'); };
  const run = (dir, ...args) => runNode(SCRIPT, { args: [...args, '--repo', dir], env: { [BUDGET_ENV]: '' } });

  function setup() {
    const dir = tempDir('review-scope-');
    g(dir, 'init', '-q', '-b', 'main');
    put(dir, 'core/pick.py', 'def pick():\n    return 1\n');
    put(dir, 'src/msg.py', 'MSG = "ok"\n');
    put(dir, '.claude/review-rules.json', JSON.stringify({ riskyPaths: ['core/**'] }));
    commit(dir, 'base');
    g(dir, 'switch', '-q', '-c', 'feature');
    put(dir, 'src/msg.py', 'MSG = "done"\n');
    put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert True\n');
    const reviewed = commit(dir, 'feature');
    return { dir, reviewed };
  }

  test('change lists committed, unstaged and untracked files against the merge base', () => {
    const { dir } = setup();
    put(dir, 'core/pick.py', 'def pick():\n    return 2\n');
    put(dir, 'src/new.py', 'a = 1\nb = 2\n');
    const r = run(dir, 'change', '--json');
    assert.equal(r.code, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.base, 'main');
    assert.deepEqual(j.files.map((x) => x.path), ['core/pick.py', 'src/msg.py', 'src/new.py', 'tests/test_msg.py']);
    assert.deepEqual(j.summary.risky, ['core/pick.py']);
    assert.equal(j.files.find((x) => x.path === 'src/new.py').added, 2);
  });

  test('a clean fix exits 0 and prints the second-look command for the fix files only', () => {
    const { dir, reviewed } = setup();
    put(dir, 'src/msg.py', 'MSG = "Done."\n');
    put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert MSG == "Done."\n');
    commit(dir, 'fix');
    const r = run(dir, 'fix', '--since', reviewed);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Flags: none/);
    assert.match(r.stdout, new RegExp(` diff ${reviewed.slice(0, 12)} -- src/msg.py tests/test_msg.py\\n?$`));
  });

  test('a fix in risky code, outside the change, without a test exits 1 with all three flags', () => {
    const { dir, reviewed } = setup();
    put(dir, 'core/pick.py', 'def pick():\n    return 3\n');
    const r = run(dir, 'fix', '--since', reviewed, '--json');
    assert.equal(r.code, 1, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).flags.map((x) => x.id), ['NO_TEST', 'RISKY', 'OUTSIDE']);
  });

  test('the second-look command works from any folder and names new untracked files', () => {
    const { dir, reviewed } = setup();
    put(dir, 'src/msg.py', 'MSG = "Done."\n');
    put(dir, 'tests/test_new.py', 'def test_new():\n    assert True\n');
    const r = run(dir, 'fix', '--since', reviewed);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const top = g(dir, 'rev-parse', '--show-toplevel');
    assert.ok(r.stdout.includes(`git -C ${top.includes(' ') ? `'${top}'` : top} diff ${reviewed.slice(0, 12)} --`), r.stdout);
    assert.match(r.stdout, /New files, not in git yet, read them whole: tests\/test_new\.py/);
    assert.doesNotMatch(r.stdout.split('\n').find((l) => l.includes(' diff ')), /test_new/);
  });

  test('a reviewed commit on the base branch asks for --base instead of flagging every file', () => {
    const { dir } = setup();
    g(dir, 'switch', '-q', 'main');
    const start = g(dir, 'rev-parse', 'HEAD');
    put(dir, 'src/msg.py', 'MSG = "main"\n');
    put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert True\n');
    const reviewed = commit(dir, 'work on main');
    put(dir, 'src/msg.py', 'MSG = "main!"\n');
    put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert MSG\n');
    const bare = run(dir, 'fix', '--since', reviewed);
    assert.equal(bare.code, 2);
    assert.match(bare.stderr, /--base <the commit the change started from>/);
    const r = run(dir, 'fix', '--since', reviewed, '--base', start);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const c = run(dir, 'change');
    assert.equal(c.code, 2);
    assert.match(c.stderr, /--base/);
  });

  test('a new branch with only uncommitted edits is a change, not an error', () => {
    const { dir } = setup();
    g(dir, 'switch', '-q', '-c', 'fresh', 'main');
    put(dir, 'src/msg.py', 'MSG = "fresh"\n');
    const r = run(dir, 'change', '--json');
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).files.map((x) => x.path), ['src/msg.py']);
  });

  test('a base with no shared history says so', () => {
    const { dir } = setup();
    g(dir, 'switch', '-q', '--orphan', 'other');
    put(dir, 'x.py', 'x = 1\n');
    commit(dir, 'orphan');
    const r = run(dir, 'change', '--base', 'feature');
    assert.equal(r.code, 2);
    assert.match(r.stderr, /no history in common/);
  });

  test('a config file with a byte order mark is read', () => {
    const { dir } = setup();
    put(dir, '.claude/review-rules.json', '\uFEFF' + JSON.stringify({ riskyPaths: ['core/**'] }));
    const r = run(dir, 'config');
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Risky paths: core\/\*\*/);
  });

  test('config prints the file read, the budget and where it came from, the log, the must-fix list and the checks', () => {
    const { dir } = setup();
    put(dir, '.claude/review-rules.json', JSON.stringify({
      mustFix: ['a migration with no way back'], riskyPaths: ['core/**'], checks: ['make test', 'make lint'],
      delegation: { log: '.claude/delegation.log' },
    }));
    const r = runNode(SCRIPT, { args: ['config', '--repo', dir], env: { [BUDGET_ENV]: 'tight' } });
    assert.equal(r.code, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines[0], '.claude/review-rules.json');
    assert.match(r.stdout, /^Budget: tight \(from LEAN_SUBAGENT_BUDGET\); delegate changes of \d+\+ files, make smaller changes yourself$/m);
    assert.ok(lines.includes('Delegation log: .claude/delegation.log'), r.stdout);
    assert.ok(lines.indexOf('Must fix:') < lines.indexOf('  - a migration with no way back'), r.stdout);
    assert.ok(lines.includes('Risky paths: core/**'), r.stdout);
    assert.ok(lines.includes('Checks: make test; make lint'), r.stdout);
  });

  test('config without a config file says it uses the defaults, with no log and no checks set', () => {
    const dir = tempDir('review-scope-');
    g(dir, 'init', '-q', '-b', 'main');
    const r = run(dir, 'config');
    assert.equal(r.code, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines[0], 'No .claude/review-rules.json; defaults');
    assert.match(r.stdout, /^Budget: normal \(from default\); delegate any change in behaviour or tests/m);
    assert.ok(lines.includes('Delegation log: off'), r.stdout);
    assert.match(r.stdout, /^Checks: none set; /m);
  });

  test('an invalid config file stops every command with exit 2', () => {
    const { dir } = setup();
    put(dir, '.claude/review-rules.json', '{"riskyPath": []}');
    for (const args of [['config'], ['change'], ['fix', '--since', 'HEAD']]) {
      const r = run(dir, ...args);
      assert.equal(r.code, 2, args.join(' '));
      assert.match(r.stderr, /unknown key "riskyPath"/);
    }
  });

  test('a since that is not a commit, and a folder that is not a repository, exit 2', () => {
    const { dir } = setup();
    assert.equal(run(dir, 'fix', '--since', 'no-such-ref').code, 2);
    // GIT_CEILING_DIRECTORIES stops git above the folder, so a repository around the temporary folder cannot make it one.
    const d = tempDir('not-a-repo-');
    const outside = runNode(SCRIPT, { args: ['config', '--repo', d], env: { [BUDGET_ENV]: '', GIT_CEILING_DIRECTORIES: dirname(realpathSync(d)) } });
    assert.equal(outside.code, 2);
  });
});
