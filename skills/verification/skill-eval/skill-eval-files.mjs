// skill-eval module: the command line parser and the file system and git helpers that setup, run and blind share.
import {
  mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, realpathSync, cpSync, rmSync,
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
  skill-eval.mjs unblind <lab-dir>
  skill-eval.mjs triggers <lab-dir> --skills <dir> [--skills <dir>]... --requests <dir> --model <model> --max-usd <x> [--also <dir>]... [--repeats 2] [--usd-per-run 0.08] [--parallel 3] [--plan] [--baseline <summary.json or folder>] [--pass-env <NAME>...] [--real-home] [--timeout-min 5]
  skill-eval.mjs split-summary <summary.json> --out <folder>`;

const NAME = /^[a-z][a-z0-9-]*$/;
const FLAGS = {
  setup: { '--root': 'one', '--task': 'one', '--variant': 'many', '--prompt': 'many', '--n': 'one', '--slug': 'one', '--allow-word': 'many', '--grade-reply': 'bool', '--seed': 'one' },
  run: { '--model': 'one', '--effort': 'one', '--allow-tool': 'list', '--pass-env': 'list', '--real-home': 'bool', '--parallel': 'one', '--timeout-min': 'one', '--max-budget-usd': 'one', '--force': 'bool' },
  actions: {},
  blind: { '--out': 'one', '--seed': 'one', '--force': 'bool' },
  judge: { '--model': 'one', '--effort': 'one', '--pass-env': 'list', '--real-home': 'bool', '--force': 'bool' },
  unblind: {},
  triggers: {
    '--skills': 'many', '--also': 'many', '--requests': 'one', '--model': 'one', '--max-usd': 'one', '--repeats': 'one',
    '--usd-per-run': 'one', '--parallel': 'one', '--plan': 'bool', '--baseline': 'one', '--pass-env': 'list',
    '--real-home': 'bool', '--timeout-min': 'one',
  },
  'split-summary': { '--out': 'one' },
};
const fail = (msg) => { throw new Error(`${msg}\n${USAGE}`); };

/** Parse the command line; throws on anything it does not understand. */
export function parseArgs(argv) {
  const [cmd, target, ...rest] = argv;
  if (!argv.length) throw new Error(USAGE);
  if (!Object.hasOwn(FLAGS, cmd)) fail(`unknown command ${cmd}`);
  if (!target || target.startsWith('--')) fail(`${cmd} needs a folder or file`);
  const raw = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const kind = Object.hasOwn(FLAGS[cmd], flag) ? FLAGS[cmd][flag] : null;
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
  } else if (cmd === 'split-summary') {
    if (raw['--out'] === undefined) fail('split-summary needs --out');
    o.out = raw['--out'];
  } else if (cmd === 'blind') {
    o.out = raw['--out'] || null;
    o.seed = int('--seed', -(2 ** 31), 2 ** 31, null);
  } else if (cmd === 'triggers') {
    for (const f of ['--skills', '--requests', '--model', '--max-usd']) if (raw[f] === undefined) fail(`triggers needs ${f}`);
    const usd = (flag, dflt) => {
      const micros = parseUsdMicros(raw[flag] ?? dflt);
      if (micros === null || micros <= 0) fail(`${flag} takes US dollars above 0 with at most 6 decimals, such as 0.08: ${raw[flag]}`);
      return micros;
    };
    Object.assign(o, {
      skills: raw['--skills'], also: raw['--also'] || [], requests: raw['--requests'], model: raw['--model'],
      capMicros: usd('--max-usd'), usdPerRunMicros: usd('--usd-per-run', '0.08'), repeats: int('--repeats', 1, 10, 2),
      parallel: int('--parallel', 1, 10, 3), timeoutMin: int('--timeout-min', 1, 60, 5), plan: !!raw['--plan'],
      baseline: raw['--baseline'] || null, passEnv: raw['--pass-env'] || [], realHome: !!raw['--real-home'],
    });
    for (const n of o.passEnv) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) fail(`--pass-env takes variable names: ${n}`);
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

/** A path that is missing or an empty folder: where a new set of files may go. */
const isFreeFolder = (dir) => !existsSync(dir) || (statSync(dir).isDirectory() && readdirSync(dir).length === 0);

/** The largest file the repository may track, in bytes. */
const MAX_TRACKED = 20_000;

/** Writes each { <file name>: object } into dir as indented JSON; returns a warning for each file over MAX_TRACKED. */
function writeParts(dir, parts) {
  mkdirSync(dir, { recursive: true });
  const warnings = [];
  for (const [name, data] of Object.entries(parts)) {
    const text = JSON.stringify(data, null, 2) + '\n';
    writeFileSync(join(dir, name), text);
    const bytes = Buffer.byteLength(text);
    if (bytes > MAX_TRACKED) warnings.push(`${name} is ${bytes} bytes, over ${MAX_TRACKED}, the largest file the repository may track`);
  }
  return warnings;
}

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

// ---------------------------------------------------------------------------------------------------------------
// Money for the triggers mode: whole micro-dollars (1 US dollar is 1,000,000), never a float
// ---------------------------------------------------------------------------------------------------------------

/** "0.08" as 80000: a decimal number of US dollars with at most 6 decimals, read with integer arithmetic; null if not one. */
function parseUsdMicros(text) {
  const m = /^(\d{1,9})(?:\.(\d{1,6}))?$/.exec(String(text));
  if (!m) return null;
  return Number(m[1]) * 1_000_000 + Number((m[2] || '').padEnd(6, '0'));
}

const splitMicros = (micros) => [(micros - (micros % 1_000_000)) / 1_000_000, micros % 1_000_000];

/** 80000 as "0.08", 300000 as "0.3", 40000000 as "40": the exact amount, for a command line flag. */
function microsArg(micros) {
  const [whole, part] = splitMicros(micros);
  const decimals = String(part).padStart(6, '0').replace(/0+$/, '');
  return decimals ? `${whole}.${decimals}` : String(whole);
}

/** 1235000 as "$1.24": dollars and cents for people, rounded once, half up, from whole micro-dollars. */
function microsUsd(micros) {
  if (micros === null || micros === undefined) return 'unknown';
  const cents = (micros + 5_000 - ((micros + 5_000) % 10_000)) / 10_000;
  return `$${(cents - (cents % 100)) / 100}.${String(cents % 100).padStart(2, '0')}`;
}

export { parseUsdMicros, microsArg, microsUsd };

export { realOrPlanned, isEmptyOrMissing, isFreeFolder, writeParts, walk, readText, gitEnv, git, ignoredManifest, HOME_NAME, buildRun, readJson, mtime, money };
