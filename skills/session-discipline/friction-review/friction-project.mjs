// The project part of friction.mjs: the check commands the project defines, the guardrails that run them (CI,
// pre-commit, Claude Code hooks), which check each guardrail names, and the size of the instruction files.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { show, plural } from './friction-show.mjs';

const listDir = (d) => { try { return readdirSync(d, { withFileTypes: true }); } catch { return []; } };
const statOf = (p) => { try { return statSync(p); } catch { return null; } };
const isFile = (p) => !!statOf(p)?.isFile();
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const rel = (root, p) => relative(root, p).split(sep).join('/');

/** A check command: how it is shown, where it is defined, the word sequences that run it, and a word it needs. */
const check = (cmd, source, spellings, { need, ids = [] } = {}) => ({ cmd, source, spellings: spellings.map((s) => s.split(' ')), need, ids });

function readJson(root, name, problems) {
  const text = readText(join(root, name));
  if (text === null) return null;
  try { return JSON.parse(text); } catch {
    problems.push(`${name} does not parse as JSON`);
    return null;
  }
}

const SCRIPTS = ['test', 'lint', 'typecheck', 'type-check', 'check', 'format:check', 'fmt'];
const LOCKS = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['package-lock.json', 'npm']];

function packageChecks(root, problems) {
  const pkg = readJson(root, 'package.json', problems);
  const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts && !Array.isArray(pkg.scripts) ? pkg.scripts : {};
  const pm = (LOCKS.find(([f]) => isFile(join(root, f))) || [null, 'npm'])[1];
  return SCRIPTS.filter((s) => Object.hasOwn(scripts, s)).map((s) => {
    const run = `${pm} run ${s}`;
    // "bun test" is bun's own test runner, not the script; npm, pnpm and yarn run the test script as "<pm> test".
    const short = s === 'test' && pm !== 'bun' ? `${pm} test` : null;
    // pnpm and yarn run any other script as "<pm> <script>" too.
    const bare = s !== 'test' && (pm === 'pnpm' || pm === 'yarn') ? `${pm} ${s}` : null;
    return check(short || run, 'package.json', [short, run, bare].filter(Boolean));
  });
}

const MAKE_TARGETS = ['test', 'check', 'lint', 'fmt', 'vet', 'typecheck'];

function makeChecks(root) {
  const out = [];
  for (const name of ['GNUmakefile', 'Makefile']) {
    const text = readText(join(root, name));
    if (text === null) continue;
    for (const t of MAKE_TARGETS) {
      // A line pattern, not a Makefile parser: a rule starts the line with its target and a colon (":=" assigns).
      if (new RegExp(`^${t}\\s*:(?!=)`, 'm').test(text) && !out.some((c) => c.cmd === `make ${t}`)) out.push(check(`make ${t}`, name, [`make ${t}`]));
    }
  }
  return out;
}

function pythonChecks(root) {
  const out = [];
  const add = (cmd, source, spelling = cmd, opts) => { if (!out.some((c) => c.cmd === cmd)) out.push(check(cmd, source, [spelling], opts)); };
  const toml = readText(join(root, 'pyproject.toml'));
  if (toml !== null) {
    // Line patterns, not a TOML parser: a table header at the start of a line.
    if (/^\[tool\.pytest\.ini_options\]/m.test(toml)) add('pytest', 'pyproject.toml');
    if (/^\[tool\.ruff[.\]]/m.test(toml)) add('ruff check', 'pyproject.toml', 'ruff check', { ids: ['ruff', 'ruff-check'] });
    if (/^\[tool\.mypy[.\]]/m.test(toml)) add('mypy', 'pyproject.toml', 'mypy', { ids: ['mypy'] });
    if (/^\[tool\.black\]/m.test(toml)) add('black --check', 'pyproject.toml', 'black', { need: '--check', ids: ['black'] });
  }
  if (isFile(join(root, 'pytest.ini'))) add('pytest', 'pytest.ini');
  if (isFile(join(root, 'tox.ini'))) add('tox', 'tox.ini');
  if (isFile(join(root, 'noxfile.py'))) add('nox', 'noxfile.py');
  return out;
}

function cargoChecks(root) {
  if (!isFile(join(root, 'Cargo.toml'))) return [];
  return [check('cargo test', 'Cargo.toml', ['cargo test']), check('cargo clippy', 'Cargo.toml', ['cargo clippy'], { ids: ['clippy'] }),
    check('cargo fmt --check', 'Cargo.toml', ['cargo fmt'], { need: '--check', ids: ['fmt'] })];
}

function goChecks(root) {
  if (!isFile(join(root, 'go.mod'))) return [];
  const out = [check('go test ./...', 'go.mod', ['go test']), check('go vet ./...', 'go.mod', ['go vet'])];
  const lint = ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'].find((f) => isFile(join(root, f)));
  if (lint) out.push(check('golangci-lint run', lint, ['golangci-lint run'], { ids: ['golangci-lint'] }));
  return out;
}

const CI_FILES = ['.gitlab-ci.yml', '.circleci/config.yml', 'azure-pipelines.yml', 'Jenkinsfile', 'bitbucket-pipelines.yml'];
const HOOK_NAME = /^(pre-[a-z-]+|commit-msg|prepare-commit-msg)$/;

function gitHooksDir(root) {
  try {
    const p = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'hooks'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return resolve(root, p);
  } catch { return null; }
}

/** The CI files and pre-commit files as { name, text }, and the Claude Code hooks of .claude/settings.json. */
function guardrails(root, settings) {
  const ci = [];
  for (const e of listDir(join(root, '.github', 'workflows'))) if (e.isFile() && /\.ya?ml$/.test(e.name)) ci.push(`.github/workflows/${e.name}`);
  for (const f of CI_FILES) if (isFile(join(root, f))) ci.push(f);
  const pre = ['.pre-commit-config.yaml', 'lefthook.yml'].filter((f) => isFile(join(root, f)));
  for (const e of listDir(join(root, '.husky'))) if (e.isFile() && HOOK_NAME.test(e.name)) pre.push(`.husky/${e.name}`);
  const hooks = gitHooksDir(root);
  // An executable file in the git hooks folder that is not a sample. The mode bits say nothing on Windows.
  for (const e of hooks ? listDir(hooks) : []) {
    const p = join(hooks, e.name);
    if (e.isFile() && !e.name.endsWith('.sample') && (statOf(p).mode & 0o111)) pre.push(p.startsWith(root + sep) ? rel(root, p) : p);
  }
  const files = (names) => names.map((name) => ({ name, text: readText(resolve(root, name)) || '' }));
  const claude = settings && typeof settings.hooks === 'object' && settings.hooks && Object.keys(settings.hooks).length ? JSON.stringify(settings.hooks) : null;
  return { ci: files(ci), pre: files(pre), claude };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a line of a guardrail file runs the check: one of its spellings as words, or a pre-commit hook id. */
function names(text, c) {
  const words = c.spellings.map((sp) => new RegExp(`(?<![\\w./-])${sp.map(escapeRe).join('\\s+')}(?![\\w-])`));
  const ids = c.ids.map((id) => new RegExp(`^\\s*-?\\s*id:\\s*["']?${escapeRe(id)}["']?\\s*$`));
  return text.split(/\r?\n/).some((line) => (words.some((re) => re.test(line)) && (!c.need || line.includes(c.need))) || ids.some((re) => re.test(line)));
}

function instructionFiles(root) {
  const rules = listDir(join(root, '.claude', 'rules')).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => `.claude/rules/${e.name}`).sort();
  const out = [];
  for (const name of ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.claude/CLAUDE.md', ...rules]) {
    const st = statOf(join(root, name));
    if (st?.isFile()) out.push({ name, tokens: Math.ceil(st.size / 4) });
  }
  const user = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'CLAUDE.md');
  const st = statOf(user);
  if (st?.isFile()) out.push({ name: user, tokens: Math.ceil(st.size / 4) });
  return out;
}

/** Everything the project part prints, from the repository root. */
export function readProject(root) {
  const problems = [];
  const checks = [...packageChecks(root, problems), ...makeChecks(root), ...pythonChecks(root), ...cargoChecks(root), ...goChecks(root)];
  const settings = readJson(root, '.claude/settings.json', problems);
  const g = guardrails(root, settings);
  for (const c of checks) {
    c.wired = [g.ci.some((f) => names(f.text, c)) && 'CI', g.pre.some((f) => names(f.text, c)) && 'pre-commit', !!g.claude && names(g.claude, c) && 'Claude Code hook'].filter(Boolean);
  }
  return { checks, guardrails: g, noGuardrail: !g.ci.length && !g.pre.length, instructions: instructionFiles(root), problems };
}

/**
 * The distinct paths added by the commits from day `from` to day `to` (UTC days, both read whole), 0 with an unborn
 * HEAD, or null when git log fails (a missing object, say), so that one count does not end the report. Merges, renames and commits with no parent are left out: a shallow clone's edge commit lists every file as
 * added. git log --since stops at the first commit older than the date.
 */
export function newFilesInCommits(root, from, to) {
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
  try { git(['rev-parse', '-q', '--verify', 'HEAD']); } catch { return 0; }
  const until = new Date(Date.parse(`${to}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
  let log;
  try {
    log = git(['log', '--no-merges', '--find-renames', '--diff-filter=A', '--name-only', '--format=%x00%P',
      `--since=${from}T00:00:00Z`, `--until=${until}T00:00:00Z`, 'HEAD']);
  } catch { return null; }
  const paths = new Set();
  for (const commit of log.split('\0').slice(1)) {
    const [parents, ...names] = commit.split('\n');
    if (parents.trim()) for (const name of names) if (name) paths.add(name);
  }
  return paths.size;
}

const list = (names) => (names.length ? names.map((n) => show(n, 200)).join(', ') : 'none');

export function printProject(p, out) {
  out('## Project');
  if (!p.checks.length) out('check: none found (package.json, Makefile, pyproject.toml, pytest.ini, tox.ini, noxfile.py, Cargo.toml, go.mod)');
  for (const c of p.checks) out(`check: ${c.cmd} (${c.source}), named by: ${c.wired.length ? c.wired.join(', ') : 'nothing (unwired check)'}`);
  const g = p.guardrails;
  out(`guardrails: CI: ${list(g.ci.map((f) => f.name))}; pre-commit: ${list(g.pre.map((f) => f.name))}; Claude Code hooks: ${g.claude ? '.claude/settings.json' : 'none'}`);
  if (p.noGuardrail) out('finding: no guardrail (no CI file and no pre-commit hook runs a check before the code lands)');
  for (const f of p.instructions) out(`instructions: ${show(f.name, 200)}, ${plural(f.tokens, 'token')}`);
  for (const problem of p.problems) out(`problem: ${problem}`);
}
