// skill-eval module: the command line parser and the file system and git helpers that setup, run and blind share.
import {
  mkdirSync, readdirSync, readFileSync, existsSync, statSync, realpathSync, cpSync, rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, relative, isAbsolute, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { META_WORDS } from './skill-eval-core.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------------------------

const USAGE = `usage:
  skill-eval.mjs setup <lab-dir> --root <dir> --task <dir> --variant <name>=<skill-dir|none> --variant ... --prompt [<name>=]<file> [--n 3] [--slug <name>] [--allow-word <word>]... [--grade-reply] [--seed <integer>]
  skill-eval.mjs run <lab-dir> --model <model> [--effort <level>] [--allow-tool <rule>...]... [--pass-env <NAME>...] [--real-home] [--parallel <k>] [--timeout-min 30] [--max-budget-usd <x>] [--force]
  skill-eval.mjs actions <transcript.jsonl>
  skill-eval.mjs blind <lab-dir> [--out <dir>] [--seed <integer>] [--force]
  skill-eval.mjs judge <lab-dir> --model <model> [--effort <level>] [--pass-env <NAME>...] [--real-home] [--force]
  skill-eval.mjs unblind <lab-dir>`;

const NAME = /^[a-z][a-z0-9-]*$/;
const FLAGS = {
  setup: { '--root': 'one', '--task': 'one', '--variant': 'many', '--prompt': 'many', '--n': 'one', '--slug': 'one', '--allow-word': 'many', '--grade-reply': 'bool', '--seed': 'one' },
  run: { '--model': 'one', '--effort': 'one', '--allow-tool': 'list', '--pass-env': 'list', '--real-home': 'bool', '--parallel': 'one', '--timeout-min': 'one', '--max-budget-usd': 'one', '--force': 'bool' },
  actions: {},
  blind: { '--out': 'one', '--seed': 'one', '--force': 'bool' },
  judge: { '--model': 'one', '--effort': 'one', '--pass-env': 'list', '--real-home': 'bool', '--force': 'bool' },
  unblind: {},
};
const fail = (msg) => { throw new Error(`${msg}\n${USAGE}`); };

/** Parse the command line; throws on anything it does not understand. */
export function parseArgs(argv) {
  const [cmd, target, ...rest] = argv;
  if (!argv.length) throw new Error(USAGE);
  if (!(cmd in FLAGS)) fail(`unknown command ${cmd}`);
  if (!target || target.startsWith('--')) fail(`${cmd} needs a folder or file`);
  const raw = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const kind = FLAGS[cmd][flag];
    if (!kind) fail(`unknown option ${flag}`);
    if (kind === 'bool') { raw[flag] = true; continue; }
    if (kind === 'list') {
      // Like claude's own --allowedTools: every value up to the next option.
      const start = i + 1;
      while (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) i++;
      if (i < start) fail(`${flag} needs a value`);
      (raw[flag] ||= []).push(...rest.slice(start, i + 1));
      continue;
    }
    const val = rest[++i];
    if (val === undefined) fail(`${flag} needs a value`);
    if (kind === 'many') (raw[flag] ||= []).push(val);
    else raw[flag] = val;
  }
  const o = { cmd, target, force: !!raw['--force'] };
  const int = (flag, min, max, dflt) => {
    if (raw[flag] === undefined) return dflt;
    if (!/^-?\d+$/.test(raw[flag]) || Number(raw[flag]) < min || Number(raw[flag]) > max) fail(`${flag} must be a whole number from ${min} to ${max}`);
    return Number(raw[flag]);
  };
  if (cmd === 'setup') {
    for (const f of ['--root', '--task', '--prompt']) if (!raw[f]) fail(`setup needs ${f}`);
    o.root = raw['--root'];
    o.task = raw['--task'];
    o.n = int('--n', 1, 20, 3);
    o.slug = raw['--slug'] || null;
    o.variants = (raw['--variant'] || []).map((v) => {
      const m = /^([^=]+)=(.+)$/.exec(v);
      if (!m || !NAME.test(m[1])) fail(`--variant takes <name>=<skill folder or none>, with a name in lower case letters, digits and -: ${v}`);
      return { name: m[1], dir: m[2] === 'none' ? null : m[2] };
    });
    o.prompts = raw['--prompt'].map((p) => {
      const m = /^([a-z][a-z0-9-]*)=(.+)$/.exec(p);
      return m ? { variant: m[1], file: m[2] } : { variant: null, file: p };
    });
    o.allowWords = raw['--allow-word'] || [];
    for (const w of o.allowWords) if (!META_WORDS.includes(w)) fail(`--allow-word takes one of: ${META_WORDS.join(', ')}`);
    o.gradeReply = !!raw['--grade-reply'];
    o.seed = int('--seed', -(2 ** 31), 2 ** 31, null);
  } else if (cmd === 'run' || cmd === 'judge') {
    if (!raw['--model']) fail(`${cmd} needs --model: name the model every run uses, and record it`);
    o.model = raw['--model'];
    o.effort = raw['--effort'] || null;
    o.passEnv = raw['--pass-env'] || [];
    for (const n of o.passEnv) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) fail(`--pass-env takes variable names: ${n}`);
    o.realHome = !!raw['--real-home'];
    if (cmd === 'run') {
      o.allowTools = raw['--allow-tool'] || [];
      o.parallel = int('--parallel', 1, 100, null);
      o.timeoutMin = int('--timeout-min', 1, 600, 30);
      o.maxBudgetUsd = raw['--max-budget-usd'] || null;
      if (o.maxBudgetUsd && !/^\d+(\.\d+)?$/.test(o.maxBudgetUsd)) fail('--max-budget-usd takes a number');
    }
  } else if (cmd === 'blind') {
    o.out = raw['--out'] || null;
    o.seed = int('--seed', -(2 ** 31), 2 ** 31, null);
  }
  return o;
}

// ---------------------------------------------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------------------------------------------

/** True when `child` is `parent` or lies under it (both absolute). */
export function isInside(child, parent) {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
}

/** realpath of a path that may not exist yet: the real nearest existing ancestor, plus the rest. */
function realOrPlanned(p) {
  let cur = resolve(p);
  const rest = [];
  while (!existsSync(cur)) { rest.unshift(basename(cur)); cur = dirname(cur); }
  return join(realpathSync(cur), ...rest);
}

const isEmptyOrMissing = (dir) => !existsSync(dir) || readdirSync(dir).length === 0;

/** Files Claude Code reads from a folder and every folder above the working directory. */
export const INHERITED = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.claude'];

/** The INHERITED files in `dir` (if it exists) and in every folder above it, as absolute paths. */
export function inheritedConfig(dir) {
  const found = [];
  for (let cur = resolve(dir); ; cur = dirname(cur)) {
    for (const f of INHERITED) if (existsSync(join(cur, f))) found.push(join(cur, f));
    if (dirname(cur) === cur) break;
  }
  return found;
}

/** Every entry under dir, as relative paths with /, skipping .git: { rel, abs, dir, other } (other: a link or special file). */
function walk(dir) {
  const out = [];
  const visit = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const other = e.isSymbolicLink() ? 'a link' : (!e.isDirectory() && !e.isFile() ? 'not a file or folder' : null);
      out.push({ rel: r, abs: join(abs, e.name), dir: e.isDirectory(), other });
      if (e.isDirectory()) visit(join(abs, e.name), r);
    }
  };
  visit(dir, '');
  return out;
}

function readText(file) {
  try {
    if (statSync(file).size > 1_000_000) return null;
    const t = readFileSync(file, 'utf8');
    return t.includes('\u0000') ? null : t;
  } catch { return null; }
}

/** This environment without the variables that point git at another repository. */
const gitEnv = (extra = {}) => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR|NAMESPACE|CEILING_DIRECTORIES)$/.test(k))),
  ...extra,
});

function git(cwd, args, env = gitEnv()) {
  return spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 64 << 20 });
}

/** The files .gitignore hides in a run folder, the installed skill left out: { path: sha256 }. */
function ignoredManifest(dir, skill) {
  const r = git(dir, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard']);
  const out = {};
  for (const f of r.stdout.split('\0').filter(Boolean)) {
    if (skill && f.startsWith(`.claude/skills/${skill}/`)) continue;
    try { out[f] = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex'); } catch { out[f] = 'unreadable'; }
  }
  return out;
}

const HOME_NAME = (slug) => (slug === 'home' ? 'home-folder' : 'home');

/** (Re)build one run folder and its HOME from the lab's copies; sets run.base and run.ignored. */
function buildRun(run, plan, lab) {
  rmSync(run.dir, { recursive: true, force: true });
  rmSync(run.home, { recursive: true, force: true });
  cpSync(join(lab, 'source', 'task'), run.dir, { recursive: true });
  const v = plan.variants.find((x) => x.name === run.variant);
  if (v.dir) cpSync(join(lab, 'source', 'variants', v.name), join(run.dir, '.claude', 'skills', plan.skill), { recursive: true });
  mkdirSync(run.home);
  const steps = [['init', '-q'], ['symbolic-ref', 'HEAD', 'refs/heads/main'], ['config', 'user.name', 'Sam Rivera'],
    ['config', 'user.email', 'sam@example.com'], ['config', 'commit.gpgsign', 'false'], ['add', '-A'],
    ['commit', '-q', '--allow-empty', '-m', 'Initial commit']];
  for (const st of steps) {
    const r = git(run.dir, st);
    if (r.status !== 0) throw new Error(`git ${st.join(' ')} failed in ${run.dir}: ${r.stderr}`);
  }
  run.base = git(run.dir, ['rev-parse', 'HEAD']).stdout.trim();
  run.ignored = ignoredManifest(run.dir, plan.skill);
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const mtime = (f) => statSync(f).mtimeMs;
const money = (v) => `$${(v || 0).toFixed(2)}`;

export { realOrPlanned, isEmptyOrMissing, walk, readText, gitEnv, git, ignoredManifest, HOME_NAME, buildRun, readJson, mtime, money };
