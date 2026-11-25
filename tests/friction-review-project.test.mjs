// friction-review's friction.mjs, the project part: the check commands of each ecosystem, the guardrails and which
// check each names, a file that does not parse, the size of the instruction files, and the git facts the session part
// uses (new files in commits, the roots of the project), on temporary repositories.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { git, commitAt, bash, world, linesOf } from './friction-review.helpers.mjs';

const project = (files, args = []) => {
  const w = world();
  for (const [f, text] of Object.entries(files)) w.file(f, text);
  const r = w.run(...args);
  assert.equal(r.code, 0, r.stderr);
  return { w, out: r.stdout };
};
const checks = (out) => linesOf(out, 'check: ').map((l) => l.replace(/, named by: .*$/, ''));

test('package.json: the listed scripts, run with the package manager its lockfile names', () => {
  const scripts = { test: 'x', lint: 'x', 'format:check': 'x', build: 'x', fmt: 'x' };
  assert.deepEqual(checks(project({ 'package.json': JSON.stringify({ scripts }) }).out),
    ['npm test (package.json)', 'npm run lint (package.json)', 'npm run format:check (package.json)', 'npm run fmt (package.json)']);
  assert.deepEqual(checks(project({ 'package.json': JSON.stringify({ scripts: { test: 'x', lint: 'x' } }), 'pnpm-lock.yaml': '' }).out),
    ['pnpm test (package.json)', 'pnpm run lint (package.json)']);
  // bun test is bun's own runner; the script is bun run test.
  assert.deepEqual(checks(project({ 'package.json': JSON.stringify({ scripts: { test: 'x' } }), 'bun.lock': '' }).out), ['bun run test (package.json)']);
  assert.deepEqual(checks(project({ 'package.json': JSON.stringify({ scripts: { typecheck: 'x' } }), 'yarn.lock': '' }).out), ['yarn run typecheck (package.json)']);
});

test('Makefile and GNUmakefile: the listed targets, not an assignment', () => {
  assert.deepEqual(checks(project({ Makefile: 'test: build\n\tgo test\nlint :\n\tx\ncheck:=1\nbuild:\n\tx\n' }).out), ['make test (Makefile)', 'make lint (Makefile)']);
  assert.deepEqual(checks(project({ GNUmakefile: 'vet:\n\tx\n' }).out), ['make vet (GNUmakefile)']);
});

test('pyproject.toml tables, pytest.ini, tox.ini and noxfile.py', () => {
  const toml = '[project]\nname = "x"\n[tool.pytest.ini_options]\naddopts = "-q"\n[tool.ruff.lint]\nselect = ["E"]\n[tool.mypy]\nstrict = true\n[tool.black]\n';
  assert.deepEqual(checks(project({ 'pyproject.toml': toml, 'tox.ini': '[tox]\n', 'noxfile.py': '' }).out),
    ['pytest (pyproject.toml)', 'ruff check (pyproject.toml)', 'mypy (pyproject.toml)', 'black --check (pyproject.toml)', 'tox (tox.ini)', 'nox (noxfile.py)']);
  assert.deepEqual(checks(project({ 'pytest.ini': '[pytest]\n' }).out), ['pytest (pytest.ini)']);
  assert.match(project({ 'pyproject.toml': '[project]\nname = "x"\n' }).out, /^check: none found /m);
});

test('Cargo.toml: test, clippy and fmt --check', () => {
  assert.deepEqual(checks(project({ 'Cargo.toml': '[package]\nname = "x"\n' }).out), ['cargo test (Cargo.toml)', 'cargo clippy (Cargo.toml)', 'cargo fmt --check (Cargo.toml)']);
});

test('go.mod: test and vet, and golangci-lint only with its config', () => {
  assert.deepEqual(checks(project({ 'go.mod': 'module x\n' }).out), ['go test ./... (go.mod)', 'go vet ./... (go.mod)']);
  assert.deepEqual(checks(project({ 'go.mod': 'module x\n', '.golangci.json': '{}' }).out), ['go test ./... (go.mod)', 'go vet ./... (go.mod)', 'golangci-lint run (.golangci.json)']);
});

test('no checks found is said, not left blank', () => {
  assert.match(project({}).out, /^check: none found \(/m);
});

test('"no guardrail" with no CI and no pre-commit; a workflow file, a pre-commit config or a git hook is a guardrail', () => {
  const none = project({ 'package.json': JSON.stringify({ scripts: { test: 'x' } }) });
  assert.match(none.out, /^finding: no guardrail /m);
  assert.match(none.out, /^guardrails: CI: none; pre-commit: none; Claude Code hooks: none$/m);
  const ci = project({ '.github/workflows/ci.yaml': 'run: npm test\n' });
  assert.doesNotMatch(ci.out, /no guardrail/);
  assert.match(ci.out, /^guardrails: CI: \.github\/workflows\/ci\.yaml; pre-commit: none;/m);
  assert.doesNotMatch(project({ '.pre-commit-config.yaml': 'repos: []\n' }).out, /no guardrail/);
  assert.doesNotMatch(project({ '.husky/pre-commit': 'npm test\n' }).out, /no guardrail/);
  // A sample hook that git init writes is not a guardrail; an executable hook of the project's own is.
  const w = world();
  const sample = w.run();
  assert.match(sample.stdout, /^finding: no guardrail /m);
  const hook = join(w.main, '.git', 'hooks', 'pre-commit');
  mkdirSync(join(hook, '..'), { recursive: true });
  writeFileSync(hook, '#!/bin/sh\nmake lint\n');
  chmodSync(hook, 0o755);
  const own = w.run();
  assert.doesNotMatch(own.stdout, /no guardrail/);
  assert.match(own.stdout, /pre-commit: \.git\/hooks\/pre-commit;/);
});

test('wiring: each check says which guardrail names it; a check none names is unwired', () => {
  const files = {
    'package.json': JSON.stringify({ scripts: { test: 'x', lint: 'x' } }),
    'pyproject.toml': '[tool.ruff]\n',
    'Cargo.toml': '',
    '.github/workflows/ci.yml': 'steps:\n  - run: npm ci && npm test\n  - run: cargo fmt --all -- --check\n  - run: cargo fmt\n',
    '.pre-commit-config.yaml': 'repos:\n  - repo: x\n    hooks:\n      - id: ruff\n',
    '.claude/settings.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'npm run lint' }] }] } }),
  };
  const { out } = project(files);
  assert.deepEqual(linesOf(out, 'check: '), [
    'npm test (package.json), named by: CI', 'npm run lint (package.json), named by: Claude Code hook',
    'ruff check (pyproject.toml), named by: pre-commit', 'cargo test (Cargo.toml), named by: nothing (unwired check)',
    'cargo clippy (Cargo.toml), named by: nothing (unwired check)', 'cargo fmt --check (Cargo.toml), named by: CI',
  ]);
  assert.match(out, /^guardrails: CI: \.github\/workflows\/ci\.yml; pre-commit: \.pre-commit-config\.yaml; Claude Code hooks: \.claude\/settings\.json$/m);
  assert.deepEqual(linesOf(out, 'unwired checks (no CI file, pre-commit config or Claude Code hook names them): '), ['cargo test, cargo clippy']);
  // The control: with npm test gone from the workflow, it is unwired too.
  const bare = project({ ...files, '.github/workflows/ci.yml': 'steps:\n  - run: npm ci\n' });
  assert.match(bare.out, /^check: npm test \(package\.json\), named by: nothing \(unwired check\)$/m);
  // A CI step that runs cargo fmt without --check formats; it does not run the check.
  const fmt = project({ ...files, '.github/workflows/ci.yml': 'steps:\n  - run: cargo fmt\n' });
  assert.match(fmt.out, /^check: cargo fmt --check \(Cargo\.toml\), named by: nothing \(unwired check\)$/m);
});

test('a package.json or settings file that does not parse is reported, not a crash', () => {
  const { out } = project({ 'package.json': '{ "scripts": ', '.claude/settings.json': '{ nope' });
  assert.match(out, /^problem: package\.json does not parse as JSON$/m);
  assert.match(out, /^problem: \.claude\/settings\.json does not parse as JSON$/m);
});

test('instruction files with their size in tokens (bytes / 4), the home folder as ~', () => {
  const w = world();
  w.file('CLAUDE.md', 'x'.repeat(400));
  w.file('AGENTS.md', 'x'.repeat(10));
  w.file('.claude/CLAUDE.md', 'x'.repeat(8));
  w.file('.claude/rules/style.md', 'x'.repeat(40));
  w.file('.claude/rules/notes.txt', 'x');
  mkdirSync(join(w.home, '.claude'), { recursive: true });
  writeFileSync(join(w.home, '.claude', 'CLAUDE.md'), 'x'.repeat(12));
  const r = w.run();
  assert.deepEqual(linesOf(r.stdout, 'instructions: '),
    ['CLAUDE.md, 100 tokens', 'AGENTS.md, 3 tokens', '.claude/CLAUDE.md, 2 tokens', '.claude/rules/style.md, 10 tokens', '~/.claude/CLAUDE.md, 3 tokens']);
  w.file('AGENTS.md', 'x');
  assert.match(w.run().stdout, /^instructions: AGENTS\.md, 1 token$/m);
});

const ok = (w) => {
  const r = w.run();
  assert.equal(r.code, 0, r.stderr);
  return r.stdout;
};
const mtime = (file) => statSync(file).mtime.toISOString();
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
const add = (w, rel, date) => {
  w.file(rel, rel);
  git(w.main, 'add', rel);
  commitAt(w.main, date, 'commit', '-q', '-m', rel);
};
const COMMITS = /^new files in commits from (\S+) to (\S+) \(git log --diff-filter=A, without merges, renames and root commits\): (\d+)$/m;

test('navigation: new files in commits over the days of the sessions read, without renames and root commits', () => {
  const w = world();
  // Renames found whatever the user's config says.
  Object.assign(w.env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'diff.renames', GIT_CONFIG_VALUE_0: 'false' });
  const older = mtime(w.session(w.own, 'old', [bash('ls', 'a')], { ageMin: 5 * 1440 }));
  const newer = mtime(w.session(w.own, 'new', [bash('ls', 'a')], { ageMin: 3 * 1440 }));
  // Before the first day: an empty root commit and a file. On the older day a file, the one counted. A rename on the
  // newer day, and a file after the last day.
  commitAt(w.main, ago(9), 'commit', '-q', '--allow-empty', '-m', 'root');
  add(w, 'early.txt', ago(8));
  add(w, 'in.txt', older);
  git(w.main, 'mv', 'in.txt', 'moved.txt');
  commitAt(w.main, newer, 'commit', '-q', '-m', 'mv');
  add(w, 'late.txt', ago(1));
  assert.deepEqual(ok(w).match(COMMITS).slice(1), [older.slice(0, 10), newer.slice(0, 10), '1']);
  // An unborn HEAD counts 0; so does the root commit of a repository, even on a day read.
  const r = world();
  const day = mtime(r.session(r.own, 's', [bash('ls', 'a')]));
  assert.equal(ok(r).match(COMMITS)[3], '0');
  add(r, 'root.txt', day);
  assert.equal(ok(r).match(COMMITS)[3], '0');
  assert.match(ok(world()), /^new files in commits: not counted \(no session read\)$/m);
});

test('a git log that fails leaves the commits line not counted, and the rest of the report prints', () => {
  const w = world();
  const day = mtime(w.session(w.own, 's', [bash('ls', 'a')]));
  add(w, 'a.txt', day);
  add(w, 'b.txt', day);
  // HEAD still resolves, so rev-parse passes; log fails when it walks to the deleted parent.
  const first = git(w.main, 'rev-list', '--max-parents=0', 'HEAD');
  rmSync(join(w.main, '.git', 'objects', first.slice(0, 2), first.slice(2)));
  const out = ok(w);
  assert.deepEqual(linesOf(out, 'new files in commits'), [': not counted (git log failed)']);
  assert.match(out, /^## automated checks$/m);
  assert.match(out, /^# not counted: coding standards/m);
});
