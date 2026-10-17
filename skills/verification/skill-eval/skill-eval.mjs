#!/usr/bin/env node
/**
 * Blind runs of two or more variants of a skill or a prompt, as headless `claude -p` sessions, and a blind review of
 * what each run did. Every step that leaks the setup to a run, or the key to the reviewer, is done here.
 *
 *   node skill-eval.mjs setup <lab-dir> --root <dir> --task <dir> --variant <name>=<skill-dir|none> (twice or more)
 *                       --prompt [<name>=]<file> [--n 3] [--slug <folder name>] [--allow-word <word>]...
 *       Checks the prompt, the working directory path and every file and folder name for the words a run must never
 *       see (META_WORDS), and refuses on a hit; a hit inside a file only warns. Then makes, per variant, N folders
 *       <root>/tmp.XXXXXX/<slug>, each a copy of the task (without .git) with that variant of the skill in
 *       .claude/skills/<name>/, a fresh git repository with one commit, and an empty HOME next to it. The plan (which
 *       folder is which variant) and a rubric template go to <lab-dir>, which must be apart from <root> and hold no
 *       earlier plan. A root with CLAUDE.md, CLAUDE.local.md, AGENTS.md or .claude in it or above it is refused: every
 *       run would load them.
 *
 *   node skill-eval.mjs run <lab-dir> --model <model> [--effort <level>] [--allow-tool <rule>]... [--parallel <k>]
 *                       [--timeout-min 30] [--max-budget-usd <x>] [--force]
 *       Runs every folder as `claude -p <prompt> --output-format stream-json --verbose`, with the empty HOME, only the
 *       project's settings, no MCP server and none of this session's identity variables, and saves each transcript as
 *       <lab-dir>/runs/<id>.jsonl. Prints the cost of each run and the total.
 *
 *   node skill-eval.mjs actions <transcript.jsonl>
 *       Prints what one run did: every tool call with the file, command or pattern it used, failures, permission
 *       denials, and its final message (which is not evidence).
 *
 *   node skill-eval.mjs blind <lab-dir> [--out <dir>] [--seed <integer>] [--force]
 *       Checks <lab-dir>/rubric.md (3 to 6 numbered criteria, no placeholder), then writes one file per run under
 *       shuffled letters: its actions, the diff of everything it changed (the installed skill left out), its commits,
 *       and its final message, with machine paths replaced. Also writes bundle.md: the reviewer brief, the rubric and
 *       every output. The key goes to <lab-dir>/key.json and is not printed.
 *
 *   node skill-eval.mjs judge <lab-dir> --model <model> [--effort <level>] [--force]
 *       Needs your own scores in <lab-dir>/my-read.md first. Sends bundle.md on standard input to `claude -p` with no
 *       tools, no saved session, an empty HOME and an empty working folder, and saves the reply as
 *       <lab-dir>/verdict.md.
 *
 *   node skill-eval.mjs unblind <lab-dir>
 *       Prints which letter was which run and variant, the mean scores per variant from the verdict and from your
 *       read, every score where you and the reviewer are 2 or more apart, and the cost.
 *
 * SKILL_EVAL_CLAUDE names the command to run instead of `claude` (a .mjs or .js file runs with this Node); the tests use
 * it. Exit codes: 0 done; 1 refused or failed; 2 usage. Node 20+, standard library only.
 */
import {
  mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, realpathSync, mkdtempSync, cpSync, rmSync,
  createWriteStream,
} from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute, basename, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------------------------
// The words a run must never see
// ---------------------------------------------------------------------------------------------------------------

/** Words that tell a run it is being measured. A match is the word at the start of a word, in any form. */
export const META_WORDS = ['eval', 'test', 'judge', 'rubric', 'benchmark', 'candidate', 'experiment', 'score', 'compare', 'arena'];
const STEM = {
  eval: 'eval', test: 'test', judge: 'judg', rubric: 'rubric', benchmark: 'benchmark', candidate: 'candidat',
  experiment: 'experiment', score: 'scor(?:e|ing)', compare: 'compar', arena: 'arena',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The META_WORDS found in a text, in list order. Words are split at camelCase too, so `myTestFile` counts.
 * `allow` lists words to ignore; `exempt` lists names to remove before matching (the skill's own name).
 */
export function findMetaWords(text, { allow = [], exempt = [] } = {}) {
  let t = String(text ?? '');
  for (const name of exempt.filter(Boolean)) t = t.replace(new RegExp(escapeRe(name), 'gi'), ' ');
  t = t.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return META_WORDS.filter((w) => !allow.includes(w) && new RegExp(`(?<![A-Za-z])${STEM[w]}`, 'i').test(t));
}

/** The skill name in a SKILL.md frontmatter, or null. */
export function skillNameOf(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text));
  const n = m && /^name:\s*["']?([A-Za-z0-9._-]+)/m.exec(m[1]);
  return n ? n[1] : null;
}

// ---------------------------------------------------------------------------------------------------------------
// How a run is started
// ---------------------------------------------------------------------------------------------------------------

/**
 * Variables that tie a nested `claude` to the session that started it (its session id, its extra directories and
 * their CLAUDE.md files). Without removing them, a run shares this session's identity.
 */
export const IDENTITY_VARS = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_REMOTE_SESSION_ID',
  'CLAUDE_ADDITIONAL_DIRECTORIES', 'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD'];

/** The environment for a run: this one, with HOME set to the run's own empty folder and the identity removed. */
export function childEnv(env, home) {
  const out = { ...env, HOME: home };
  if ('USERPROFILE' in env) out.USERPROFILE = home;
  for (const k of IDENTITY_VARS) delete out[k];
  return out;
}

/** The arguments for one run. --allowedTools takes a list, so it comes last. */
export function candidateArgv({ prompt, model, skill = null, allowTools = [], effort = null, maxBudgetUsd = null }) {
  const a = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', model,
    // Only the project's settings and skills: no user skills (synced ones included), no user plugins.
    '--setting-sources', 'project', '--strict-mcp-config', '--no-session-persistence',
    '--permission-mode', 'acceptEdits',
    // Nobody can answer a question in -p mode.
    '--disallowedTools', 'AskUserQuestion'];
  if (effort) a.push('--effort', effort);
  if (maxBudgetUsd) a.push('--max-budget-usd', String(maxBudgetUsd));
  // A skill with allowed-tools in its frontmatter asks permission when it loads, and -p denies it.
  const allow = [...(skill ? [`Skill(${skill})`] : []), ...allowTools];
  if (allow.length) a.push('--allowedTools', ...allow);
  return a;
}

/** The arguments for the reviewer: no tools at all, so it can read only what it is sent. */
export function judgeArgv({ model, effort = null }) {
  const a = ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--setting-sources', 'project',
    '--strict-mcp-config', '--model', model];
  if (effort) a.push('--effort', effort);
  return a;
}

function claudeCommand(argv) {
  const cmd = process.env.SKILL_EVAL_CLAUDE || 'claude';
  if (/\.(mjs|js)$/.test(cmd)) return { file: process.execPath, args: [cmd, ...argv], shell: false };
  return { file: cmd, args: argv, shell: process.platform === 'win32' };
}

// ---------------------------------------------------------------------------------------------------------------
// Reading a transcript
// ---------------------------------------------------------------------------------------------------------------

const firstLine = (s) => String(s ?? '').split(/\r?\n/).find((l) => l.trim())?.trim() ?? '';
const clip = (s, n = 300) => (s.length > n ? `${s.slice(0, n)} [cut]` : s);
const contentText = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join('\n') : '');

/** What a tool call touched, in one line. */
export function targetOf(name, input = {}) {
  const i = input || {};
  const where = i.path ? ` in ${i.path}` : '';
  let t;
  switch (name) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': t = i.file_path; break;
    case 'NotebookEdit': t = i.notebook_path; break;
    case 'Bash': case 'PowerShell': t = i.command; break;
    case 'Glob': case 'Grep': t = `${i.pattern}${where}`; break;
    case 'Skill': t = `${i.skill}${i.args ? ` ${i.args}` : ''}`; break;
    case 'Agent': case 'Task': t = `${i.subagent_type || 'agent'}: ${i.description || ''}`; break;
    case 'WebFetch': t = i.url; break;
    case 'WebSearch': t = i.query; break;
    case 'TodoWrite': t = `${(i.todos || []).length} items`; break;
    default: t = JSON.stringify(i);
  }
  return clip(String(t ?? '').replace(/\r?\n/g, '\\n'));
}

/**
 * The facts of one stream-json transcript: { model, skills, steps: [{ n, tool, target, failed, bySubagent }],
 * denials, finalText, costUsd, turns, finished, isError, badLines }. A line that is not JSON is counted, not fatal.
 */
export function extractActions(text) {
  const x = { model: null, skills: [], steps: [], denials: [], finalText: '', costUsd: null, turns: null, finished: false, isError: false, badLines: 0 };
  const byId = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { x.badLines++; continue; }
    if (e.type === 'system' && e.subtype === 'init') {
      x.model = e.model ?? x.model;
      x.skills = Array.isArray(e.skills) ? e.skills : [];
    } else if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      x.model ??= e.message.model ?? null;
      for (const c of e.message.content) {
        if (c.type !== 'tool_use') continue;
        const step = { n: x.steps.length + 1, tool: c.name, target: targetOf(c.name, c.input), failed: null, bySubagent: !!e.parent_tool_use_id };
        x.steps.push(step);
        byId.set(c.id, step);
      }
    } else if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const c of e.message.content) {
        const step = c.type === 'tool_result' && byId.get(c.tool_use_id);
        if (step && c.is_error) step.failed = clip(firstLine(contentText(c.content)), 200);
      }
    } else if (e.type === 'result') {
      x.finished = true;
      x.finalText = String(e.result ?? '');
      x.costUsd = typeof e.total_cost_usd === 'number' ? e.total_cost_usd : null;
      x.turns = e.num_turns ?? null;
      x.isError = !!e.is_error;
      x.denials = (e.permission_denials || []).map((d) => `${d.tool_name}: ${targetOf(d.tool_name, d.tool_input)}`);
    }
  }
  return x;
}

function replaceAll(text, pairs) {
  let t = String(text);
  for (const [from, to] of [...pairs].filter(([f]) => f).sort((a, b) => b[0].length - a[0].length)) t = t.split(from).join(to);
  return t;
}

/** The run's own last message, marked as not evidence. */
export function finalSection(x) {
  return ['## What it said at the end (not evidence: grade what it did and what it changed, not this)', '', x.finalText || '(nothing)', ''].join('\n');
}

/** The actions of one run as Markdown, with `replace` pairs applied to every line; `final: false` leaves out its last message. */
export function renderActions(x, { replace = [], final = true } = {}) {
  const lines = ['## What it did', ''];
  if (!x.steps.length) lines.push('No tool calls.');
  for (const s of x.steps) {
    const notes = [s.bySubagent ? 'by a subagent' : '', s.failed ? `failed: ${s.failed}` : ''].filter(Boolean);
    lines.push(`${s.n}. ${s.tool}: ${s.target}${notes.length ? ` (${notes.join('; ')})` : ''}`);
  }
  lines.push('');
  if (x.denials.length) lines.push(`Refused by permissions: ${x.denials.join('; ')}`, '');
  if (!x.finished) lines.push('The run stopped before it finished.', '');
  if (final) lines.push(finalSection(x));
  return replaceAll(lines.join('\n'), replace);
}

// ---------------------------------------------------------------------------------------------------------------
// Rubric and scores
// ---------------------------------------------------------------------------------------------------------------

export const MIN_CRITERIA = 3;
export const MAX_CRITERIA = 6;

function outsideFences(text) {
  const out = [];
  let fence = null;
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (fence === null) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      continue;
    }
    if (fence === null) out.push(line);
  }
  return out;
}

/** Problems with a rubric, as sentences; empty when it is usable. */
export function validateRubric(text) {
  const errors = [];
  const lines = outsideFences(text);
  const n = lines.filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
  if (n < MIN_CRITERIA || n > MAX_CRITERIA) errors.push(`the rubric has ${n} numbered criteria; it needs ${MIN_CRITERIA} to ${MAX_CRITERIA}`);
  const left = lines.join('\n').match(/<(criterion|one line)\b[^>]*>/i);
  if (left) errors.push(`the rubric still has a template placeholder: ${left[0]}`);
  return errors;
}

export function rubricTemplate() {
  return `# Rubric

Task: <one line: what every run was asked to do, in words that fit every variant>

Only the reviewer and you read this file; no run sees it. It must not say which variant is which, or what changed
between them. Write 3 to 6 criteria that can be checked from what a run did (files opened, commands run, edits
made) and what it changed, specific to this task. Replace every placeholder line.

1. <criterion: a behaviour the change should cause, checkable in the actions or the diff>
2. <criterion>
3. <criterion>
`;
}

/** Scores in the "Criterion n: ..." then "  A: 4  evidence" format: [{ n, text, scores: { A: 4 } }]. */
export function parseScores(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/[*`]/g, '');
    const c = /^\s*#*\s*Criterion\s+(\d+)\s*[:.)]?\s*(.*)$/i.exec(line);
    if (c) { cur = { n: Number(c[1]), text: c[2].trim(), scores: {} }; out.push(cur); continue; }
    const s = cur && /^\s*(?:[-+]\s*)?([A-Z])\s*[:=]\s*([1-5])(?:\s*\/\s*5)?(?!\d)/.exec(line);
    if (s) cur.scores[s[1]] = Number(s[2]);
  }
  return out;
}

/** Scores 2 or more apart between the reviewer and you, on the same criterion and letter. */
export function disagreements(judge, mine) {
  const out = [];
  for (const j of judge) {
    const m = mine.find((x) => x.n === j.n);
    if (!m) continue;
    for (const [label, score] of Object.entries(j.scores)) {
      if (label in m.scores && Math.abs(score - m.scores[label]) >= 2) out.push({ n: j.n, label, judge: score, mine: m.scores[label] });
    }
  }
  return out;
}

const round = (v) => Math.round(v * 100) / 100;

/** { variant: { <criterion>: mean, total: sum of the means } } from scores and a letter-to-variant map. */
export function variantMeans(scores, labelToVariant) {
  const out = {};
  for (const variant of [...new Set(Object.values(labelToVariant))]) {
    const row = {};
    let total = 0;
    for (const c of scores) {
      const vals = Object.entries(c.scores).filter(([l]) => labelToVariant[l] === variant).map(([, v]) => v);
      if (!vals.length) continue;
      row[c.n] = round(vals.reduce((a, b) => a + b, 0) / vals.length);
      total += row[c.n];
    }
    row.total = round(total);
    out[variant] = row;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------------------------

const USAGE = `usage:
  skill-eval.mjs setup <lab-dir> --root <dir> --task <dir> --variant <name>=<skill-dir|none> --variant ... --prompt [<name>=]<file> [--n 3] [--slug <name>] [--allow-word <word>]...
  skill-eval.mjs run <lab-dir> --model <model> [--effort <level>] [--allow-tool <rule>]... [--parallel <k>] [--timeout-min 30] [--max-budget-usd <x>] [--force]
  skill-eval.mjs actions <transcript.jsonl>
  skill-eval.mjs blind <lab-dir> [--out <dir>] [--seed <integer>] [--force]
  skill-eval.mjs judge <lab-dir> --model <model> [--effort <level>] [--force]
  skill-eval.mjs unblind <lab-dir>`;

const NAME = /^[a-z][a-z0-9-]*$/;
const FLAGS = {
  setup: { '--root': 'one', '--task': 'one', '--variant': 'many', '--prompt': 'many', '--n': 'one', '--slug': 'one', '--allow-word': 'many' },
  run: { '--model': 'one', '--effort': 'one', '--allow-tool': 'many', '--parallel': 'one', '--timeout-min': 'one', '--max-budget-usd': 'one', '--force': 'bool' },
  actions: {},
  blind: { '--out': 'one', '--seed': 'one', '--force': 'bool' },
  judge: { '--model': 'one', '--effort': 'one', '--force': 'bool' },
  unblind: {},
};
const fail = (msg) => { throw new Error(`${msg}\n${USAGE}`); };

/** Parse the command line; throws on anything it does not understand. */
export function parseArgs(argv) {
  const [cmd, target, ...rest] = argv;
  if (!(cmd in FLAGS)) fail('unknown command');
  if (!target || target.startsWith('--')) fail(`${cmd} needs a folder or file`);
  const raw = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const kind = FLAGS[cmd][flag];
    if (!kind) fail(`unknown option ${flag}`);
    if (kind === 'bool') { raw[flag] = true; continue; }
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
  } else if (cmd === 'run' || cmd === 'judge') {
    if (!raw['--model']) fail(`${cmd} needs --model: name the model every run uses, and record it`);
    o.model = raw['--model'];
    o.effort = raw['--effort'] || null;
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

/** Every file and folder under dir, as relative paths with /, skipping .git. */
function walk(dir) {
  const out = [];
  const visit = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.push({ rel: r, abs: join(abs, e.name), dir: e.isDirectory() });
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

function git(cwd, args, env = process.env) {
  return spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 64 << 20 });
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const money = (v) => `$${(v || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------------------------------------------

function setup(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const lab = resolve(o.target);
  const root = resolve(o.root);
  const task = resolve(o.task);
  const allow = o.allowWords;

  if (existsSync(lab) && !statSync(lab).isDirectory()) return refuse(`${lab} is not a folder`);
  if (existsSync(join(lab, 'plan.json'))) return refuse(`${lab} already holds a plan; use a new lab folder`);
  if (!existsSync(task) || !statSync(task).isDirectory()) return refuse(`the task ${task} is not a folder`);
  const [labReal, rootReal, taskReal] = [lab, root, task].map(realOrPlanned);
  if (isInside(labReal, rootReal) || isInside(rootReal, labReal)) {
    return refuse(`the lab folder ${lab} and the root ${root} must be apart: neither inside the other, so no run can reach the plan`);
  }
  if (isInside(rootReal, taskReal) || isInside(labReal, taskReal)) return refuse(`the root and the lab folder must be outside the task folder ${task}`);
  const inherited = inheritedConfig(rootReal);
  if (inherited.length) {
    return refuse(`a run under ${root} would also load ${inherited.join(', ')}; pick a root with no Claude Code files in it or above it (outside your home folder and outside any project)`);
  }

  if (o.variants.length < 2) return refuse('give at least two variants (--variant <name>=<skill folder or none>, once per variant)');
  const names = o.variants.map((v) => v.name);
  if (new Set(names).size !== names.length) return refuse(`variant names repeat: ${names.join(', ')}`);
  const skillNames = new Set();
  for (const v of o.variants) {
    if (!v.dir) continue;
    v.dir = resolve(v.dir);
    const md = join(v.dir, 'SKILL.md');
    if (!existsSync(md)) return refuse(`variant ${v.name}: ${md} does not exist`);
    const n = skillNameOf(readFileSync(md, 'utf8'));
    if (!n) return refuse(`variant ${v.name}: ${md} has no name in its frontmatter`);
    skillNames.add(n);
  }
  if (skillNames.size > 1) {
    return refuse(`every variant must be the same skill with the same name, so the same prompt reaches it; the variants are named ${[...skillNames].join(', ')}`);
  }
  const skill = skillNames.size ? [...skillNames][0] : null;
  const exempt = skill ? [skill] : [];

  // Prompts: one for every variant, a shared one or one each.
  const prompts = {};
  const shared = o.prompts.filter((p) => !p.variant);
  if (shared.length > 1) return refuse('give one shared --prompt, or one --prompt <variant>=<file> per variant');
  for (const p of o.prompts.filter((x) => x.variant)) {
    if (!names.includes(p.variant)) return refuse(`--prompt names ${p.variant}, which is not a variant`);
  }
  for (const v of o.variants) {
    const p = o.prompts.find((x) => x.variant === v.name) || shared[0];
    if (!p) return refuse(`variant ${v.name} has no prompt`);
    const f = resolve(p.file);
    if (!existsSync(f)) return refuse(`the prompt file ${f} does not exist`);
    prompts[v.name] = readFileSync(f, 'utf8').trim();
    if (!prompts[v.name]) return refuse(`the prompt for ${v.name} is empty`);
    const hits = findMetaWords(prompts[v.name], { allow, exempt });
    if (hits.length) return refuse(`the prompt for ${v.name} contains ${hits.map((h) => `"${h}"`).join(', ')}; write what a user would type, with no word that says the run is measured`);
    if (!v.dir && skill && new RegExp(`^/${escapeRe(skill)}(\\s|$)`).test(prompts[v.name])) {
      return refuse(`variant ${v.name} has no skill, but its prompt starts with /${skill}; give it its own prompt (--prompt ${v.name}=<file>)`);
    }
  }

  // The working directory path: refused on any hit, whatever --allow-word says.
  const slug = o.slug || basename(task);
  if (!/^[A-Za-z0-9._-]+$/.test(slug)) return refuse(`the folder name ${slug} may hold only letters, digits, dot, underscore and -`);
  const pathHits = findMetaWords(`${rootReal}${sep}${slug}`);
  if (pathHits.length) return refuse(`the working directory path ${join(rootReal, slug)} contains ${pathHits.map((h) => `"${h}"`).join(', ')}; every run sees it. Pick a root and a folder name a user might pick`);

  // Names inside the task and the variants: refused. Contents: a warning.
  const nameHits = [];
  const warnings = [];
  const scan = (dir, shown) => {
    for (const e of walk(dir)) {
      const hits = findMetaWords(e.rel.split('/').pop(), { allow, exempt });
      if (hits.length) nameHits.push(`${shown}/${e.rel} (${hits.join(', ')})`);
      if (e.dir) continue;
      const text = readText(e.abs);
      if (text === null) continue;
      text.split(/\r?\n/).forEach((line, i) => {
        const h = findMetaWords(line, { allow, exempt });
        if (h.length) warnings.push(`${shown}/${e.rel}:${i + 1}: ${h.map((x) => `"${x}"`).join(', ')}`);
      });
    }
  };
  scan(task, 'task');
  if (skill && existsSync(join(task, '.claude', 'skills', skill))) {
    return refuse(`the task already has .claude/skills/${skill}; remove it, each run gets its own variant there`);
  }
  for (const v of o.variants) if (v.dir) scan(v.dir, `variant ${v.name}`);
  if (nameHits.length) {
    return refuse(`these names contain a word a run must not see; rename them, or pass --allow-word when the word belongs to the task itself:`, ...nameHits.slice(0, 20));
  }
  if (spawnSync('git', ['--version']).status !== 0) return refuse('git is needed to record what each run changed');

  // Write.
  mkdirSync(join(lab, 'runs'), { recursive: true });
  mkdirSync(root, { recursive: true });
  const runs = [];
  for (const v of o.variants) {
    for (let k = 0; k < o.n; k++) {
      let parent;
      for (let tries = 0; ; tries++) {
        parent = mkdtempSync(join(root, 'tmp.'));
        if (!findMetaWords(basename(parent)).length) break;
        rmSync(parent, { recursive: true, force: true });
        if (tries > 20) throw new Error('could not make a neutral folder name');
      }
      const dir = join(parent, slug);
      const home = join(parent, 'home');
      cpSync(task, dir, { recursive: true, filter: (src) => basename(src) !== '.git' });
      if (v.dir) cpSync(v.dir, join(dir, '.claude', 'skills', skill), { recursive: true, filter: (src) => basename(src) !== '.git' });
      mkdirSync(home);
      const steps = [['init', '-q'], ['symbolic-ref', 'HEAD', 'refs/heads/main'], ['config', 'user.name', 'Sam Rivera'],
        ['config', 'user.email', 'sam@example.com'], ['config', 'commit.gpgsign', 'false'], ['add', '-A'],
        ['commit', '-q', '--allow-empty', '-m', 'Initial commit']];
      for (const s of steps) {
        const r = git(dir, s);
        if (r.status !== 0) throw new Error(`git ${s.join(' ')} failed in ${dir}: ${r.stderr}`);
      }
      const base = git(dir, ['rev-parse', 'HEAD']).stdout.trim();
      runs.push({ id: `r${runs.length + 1}`, variant: v.name, dir, home, base });
    }
  }
  const plan = { skill, slug, root, n: o.n, allowWords: allow, variants: o.variants, prompts, runs };
  writeFileSync(join(lab, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  writeFileSync(join(lab, 'rubric.md'), rubricTemplate());

  for (const w of warnings.slice(0, 20)) err(`warning: ${w}`);
  if (warnings.length > 20) err(`warning: and ${warnings.length - 20} more lines with such words`);
  if (warnings.length) err('warning: a run reads these files; keep such words only where the task or the skill needs them');
  out(`Lab folder: ${lab} (only you read it: the plan, the rubric, the transcripts and the key go here)`);
  out(`Skill: ${skill || '(none: the variants differ by prompt only)'}`);
  out(`Runs: ${runs.length} runs (${o.variants.length} variants x ${o.n}) + 1 judge = ${runs.length + 1} claude -p runs`);
  out(`Next: write ${join(lab, 'rubric.md')}, then: node skill-eval.mjs run ${lab} --model <model>`);
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------------------------------------------

function runOne(run, argv, { lab, timeoutMin }) {
  return new Promise((done) => {
    const { file, args, shell } = claudeCommand(argv);
    const started = Date.now();
    const stdout = createWriteStream(join(lab, 'runs', `${run.id}.jsonl`));
    const stderr = createWriteStream(join(lab, 'runs', `${run.id}.err`));
    let child;
    try {
      child = spawn(file, args, { cwd: run.dir, env: childEnv(process.env, run.home), stdio: ['ignore', 'pipe', 'pipe'], shell });
    } catch (e) {
      done({ exit: null, error: e.message, seconds: 0 });
      return;
    }
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMin * 60_000);
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let pending = 2;
      const end = () => { if (--pending === 0) done({ ...r, seconds: Math.round((Date.now() - started) / 1000) }); };
      stdout.end(end);
      stderr.end(end);
    };
    child.on('error', (e) => finish({ exit: null, error: e.message }));
    child.on('close', (code, signal) => finish({ exit: code, signal }));
  });
}

async function run(o, out, err) {
  const lab = resolve(o.target);
  const planFile = join(lab, 'plan.json');
  if (!existsSync(planFile)) { err(`refused: ${planFile} does not exist (run setup first)`); return 1; }
  const plan = readJson(planFile);
  const done = plan.runs.filter((r) => existsSync(join(lab, 'runs', `${r.id}.jsonl`)));
  if (done.length && !o.force) {
    err(`refused: transcripts already exist for ${done.map((r) => r.id).join(', ')}; pass --force to run again and replace them`);
    return 1;
  }
  mkdirSync(join(lab, 'runs'), { recursive: true });
  writeFileSync(join(lab, 'run.json'), JSON.stringify({ model: o.model, effort: o.effort, allowTools: o.allowTools, maxBudgetUsd: o.maxBudgetUsd, at: new Date().toISOString() }, null, 2) + '\n');
  const queue = [...plan.runs];
  const results = new Map();
  const width = o.parallel || queue.length;
  const worker = async () => {
    while (queue.length) {
      const r = queue.shift();
      const argv = candidateArgv({ prompt: plan.prompts[r.variant], model: o.model, skill: plan.variants.find((v) => v.name === r.variant).dir ? plan.skill : null, allowTools: o.allowTools, effort: o.effort, maxBudgetUsd: o.maxBudgetUsd });
      const res = await runOne(r, argv, { lab, timeoutMin: o.timeoutMin });
      writeFileSync(join(lab, 'runs', `${r.id}.json`), JSON.stringify(res, null, 2) + '\n');
      results.set(r.id, res);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, queue.length) }, worker));

  let total = 0;
  let bad = 0;
  for (const r of plan.runs) {
    const res = results.get(r.id);
    const x = extractActions(readFileSync(join(lab, 'runs', `${r.id}.jsonl`), 'utf8'));
    total += x.costUsd || 0;
    const hasSkill = !!plan.variants.find((v) => v.name === r.variant).dir;
    const notes = [];
    if (!x.finished) notes.push('no result line: the run did not finish');
    if (res.error) notes.push(res.error);
    if (plan.skill && x.skills.length && x.skills.includes(plan.skill) !== hasSkill) {
      notes.push(hasSkill ? `the skill ${plan.skill} was not offered to this run` : `a copy of ${plan.skill} reached a run that should have none`);
    }
    if (x.denials.length) notes.push(`${x.denials.length} tool calls refused by permissions`);
    if (res.exit !== 0 || !x.finished) bad++;
    out(`${r.id}: exit ${res.exit ?? res.signal ?? 'none'}, ${money(x.costUsd)}${notes.length ? `; ${notes.join('; ')}` : ''}`);
  }
  out(`Candidate runs: ${plan.runs.length}, total ${money(total)}`);
  if (bad) err(`${bad} run(s) failed or did not finish; read ${join(lab, 'runs')}/<id>.err`);
  return bad ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// blind
// ---------------------------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIFF_LIMIT = 100_000;

/** Everything a run changed since its first commit, the installed skill left out, and the commits it made. */
function changesOf(run, skill) {
  const tmp = mkdtempSync(join(tmpdir(), 'idx-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(tmp, 'index') };
    const spec = ['--', '.', ...(skill ? [`:(exclude).claude/skills/${skill}`] : [])];
    for (const args of [['read-tree', 'HEAD'], ['add', '-A', ...spec]]) {
      const r = git(run.dir, args, env);
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in a run folder: ${r.stderr}`);
    }
    let diff = git(run.dir, ['diff', '--cached', '--no-color', '--no-ext-diff', run.base, ...spec], env).stdout;
    if (diff.length > DIFF_LIMIT) diff = `${diff.slice(0, DIFF_LIMIT)}\n[diff cut at ${DIFF_LIMIT} characters]\n`;
    const commits = git(run.dir, ['log', '--format=%s', `${run.base}..HEAD`]).stdout.trim();
    return { diff, commits };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function judgeBrief() {
  const text = readFileSync(join(HERE, 'JUDGE-BRIEF.md'), 'utf8');
  const at = text.search(/^---\s*$/m);
  return (at >= 0 ? text.slice(at).replace(/^---\s*\r?\n/, '') : text).trim();
}

function blind(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const lab = resolve(o.target);
  if (!existsSync(join(lab, 'plan.json'))) return refuse(`${lab} has no plan.json (run setup first)`);
  const plan = readJson(join(lab, 'plan.json'));
  const keyFile = join(lab, 'key.json');
  if (existsSync(keyFile) && !o.force) return refuse(`${keyFile} exists: a blind copy was already made. Pass --force to make a new one and replace the key`);
  const rubric = existsSync(join(lab, 'rubric.md')) ? readFileSync(join(lab, 'rubric.md'), 'utf8') : '';
  const problems = validateRubric(rubric);
  if (problems.length) return refuse(...problems);

  const forbidden = [realOrPlanned(lab), realOrPlanned(plan.root)];
  let blindDir;
  if (o.out) {
    blindDir = resolve(o.out);
    if (forbidden.some((f) => isInside(realOrPlanned(blindDir), f))) return refuse(`${blindDir} is inside the lab folder or the root`);
    if (!isEmptyOrMissing(blindDir)) return refuse(`${blindDir} exists and is not empty`);
  } else if (forbidden.some((f) => isInside(realpathSync(tmpdir()), f))) {
    return refuse('the temporary folder is inside the lab folder or the root; pass --out <folder outside both>');
  }

  const outputs = [];
  const dropouts = [];
  for (const r of plan.runs) {
    const t = join(lab, 'runs', `${r.id}.jsonl`);
    const x = existsSync(t) ? extractActions(readFileSync(t, 'utf8')) : null;
    if (!x || (!x.finished && !x.steps.length)) { dropouts.push(r.id); continue; }
    outputs.push({ run: r, x });
  }
  if (outputs.length < 2) return refuse(`fewer than 2 runs have output (dropouts: ${dropouts.join(', ') || 'none'}); run them first`);

  const rng = mulberry32(o.seed ?? randomInt(2 ** 31));
  const labelled = shuffle(outputs, rng).map((item, i) => ({ ...item, label: String.fromCharCode(65 + i) }));
  const files = {};
  for (const { run: r, x, label } of labelled) {
    const { diff, commits } = changesOf(r, plan.skill);
    const pairs = [];
    for (const [p, to] of [[r.dir, '<project>'], [r.home, '<home>'], [dirname(r.dir), '<tmp>'], [plan.root, '<tmp>']]) {
      pairs.push([p, to]);
      try { pairs.push([realpathSync(p), to]); } catch { /* gone */ }
    }
    const body = [
      `# Output ${label}`, '',
      renderActions(x, { final: false }),
      '## What it changed', '',
      diff.trim() ? ['```diff', diff.trimEnd(), '```'].join('\n') : 'No file changed.', '',
      ...(commits ? ['## Commits it made', '', commits, ''] : []),
      finalSection(x),
    ].join('\n');
    files[label] = replaceAll(body, pairs);
  }

  if (o.out) mkdirSync(blindDir, { recursive: true });
  else blindDir = mkdtempSync(join(tmpdir(), 'blind-'));
  const rubricBody = rubric.replace(/^\s*#\s*Rubric\s*\r?\n/, '').trim();
  for (const [label, text] of Object.entries(files)) writeFileSync(join(blindDir, `${label}.md`), text);
  writeFileSync(join(blindDir, 'rubric.md'), rubric);
  const bundle = [judgeBrief(), '', '# Rubric', '', rubricBody, '', ...Object.values(files)].join('\n');
  writeFileSync(join(blindDir, 'bundle.md'), bundle);
  const key = { labels: Object.fromEntries(labelled.map((l) => [l.label, l.run.id])), dropouts, blindDir };
  writeFileSync(keyFile, JSON.stringify(key, null, 2) + '\n');

  out(`Blind folder: ${blindDir}`);
  out(`Outputs: ${labelled.map((l) => l.label).join(', ')}`);
  out(`Dropouts: ${dropouts.length}`);
  out(`Next: read every output there, write your scores to ${join(lab, 'my-read.md')}, then run judge. Do not open key.json yet.`);
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// judge and unblind
// ---------------------------------------------------------------------------------------------------------------

const SCORE_FORMAT = 'one "Criterion <n>: <text>" line per criterion, then one "  <letter>: <1-5>  <evidence>" line per output';

function judge(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const lab = resolve(o.target);
  const keyFile = join(lab, 'key.json');
  if (!existsSync(keyFile)) return refuse('no blind copy yet; run blind first');
  const key = readJson(keyFile);
  const bundleFile = join(key.blindDir, 'bundle.md');
  if (!existsSync(bundleFile)) return refuse(`${bundleFile} is missing; run blind --force again`);
  const mine = join(lab, 'my-read.md');
  if (!existsSync(mine)) return refuse(`write your own scores to ${mine} first (${SCORE_FORMAT}): a verdict read first anchors them`);
  if (!parseScores(readFileSync(mine, 'utf8')).some((c) => Object.keys(c.scores).length)) {
    return refuse(`${mine} has no scores in the format: ${SCORE_FORMAT}`);
  }
  if (existsSync(join(lab, 'verdict.md')) && !o.force) return refuse('verdict.md exists; pass --force to ask again and replace it');
  const plan = readJson(join(lab, 'plan.json'));

  const cwd = mkdtempSync(join(tmpdir(), 'r-'));
  const home = mkdtempSync(join(tmpdir(), 'h-'));
  try {
    for (const d of [cwd, home]) {
      if ([lab, plan.root, key.blindDir].some((f) => isInside(realpathSync(d), realOrPlanned(f)))) return refuse('the temporary folder is inside the lab, the root or the blind folder');
    }
    const { file, args, shell } = claudeCommand(judgeArgv({ model: o.model, effort: o.effort }));
    const r = spawnSync(file, args, { cwd, env: childEnv(process.env, home), input: readFileSync(bundleFile, 'utf8'), encoding: 'utf8', timeout: 30 * 60_000, maxBuffer: 64 << 20, shell });
    if (r.status !== 0) { err(`failed: the reviewer exited ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 2000)}`); return 1; }
    let res;
    try { res = JSON.parse(r.stdout); } catch { err('failed: the reviewer did not print one JSON result'); return 1; }
    writeFileSync(join(lab, 'verdict.md'), String(res.result ?? '') + '\n');
    writeFileSync(join(lab, 'judge.json'), JSON.stringify({ model: o.model, effort: o.effort, costUsd: res.total_cost_usd ?? null, isError: !!res.is_error }, null, 2) + '\n');
    const n = parseScores(res.result).length;
    out(`Verdict: ${join(lab, 'verdict.md')} (${n ? `${n} criteria read` : `no scores in the format; read it by hand`}), cost ${money(res.total_cost_usd)}`);
    out(`Next: node skill-eval.mjs unblind ${lab}`);
    return 0;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

function unblind(o, out, err) {
  const lab = resolve(o.target);
  for (const f of ['plan.json', 'key.json', 'my-read.md', 'verdict.md']) {
    if (!existsSync(join(lab, f))) { err(`refused: ${join(lab, f)} is missing (order: blind, my-read.md, judge, unblind)`); return 1; }
  }
  const plan = readJson(join(lab, 'plan.json'));
  const key = readJson(join(lab, 'key.json'));
  const variantOf = (id) => plan.runs.find((r) => r.id === id).variant;
  const labelToVariant = Object.fromEntries(Object.entries(key.labels).map(([l, id]) => [l, variantOf(id)]));
  out('Letter  Run  Variant');
  for (const [l, id] of Object.entries(key.labels)) out(`${l}       ${id}   ${labelToVariant[l]}`);
  if (key.dropouts.length) out(`Dropouts: ${key.dropouts.map((id) => `${id} (${variantOf(id)})`).join(', ')}`);

  const judged = parseScores(readFileSync(join(lab, 'verdict.md'), 'utf8'));
  const mine = parseScores(readFileSync(join(lab, 'my-read.md'), 'utf8'));
  const show = (who, scores) => {
    if (!scores.some((c) => Object.keys(c.scores).length)) { out(`${who}: no scores in the format; compare by hand`); return; }
    out(`${who}, mean per criterion by variant:`);
    for (const [v, row] of Object.entries(variantMeans(scores, labelToVariant))) {
      out(`  ${v}: ${Object.entries(row).filter(([k]) => k !== 'total').map(([k, val]) => `${k}: ${val}`).join(', ')}, total ${row.total}`);
    }
  };
  show('Judge', judged);
  show('You', mine);
  const d = disagreements(judged, mine);
  out(`Disagreements (2 or more apart; each one is a finding to explain):${d.length ? '' : ' none'}`);
  for (const x of d) out(`  criterion ${x.n}, ${x.label}: judge ${x.judge}, you ${x.mine} (${labelToVariant[x.label]})`);

  let runsCost = 0;
  for (const r of plan.runs) {
    const t = join(lab, 'runs', `${r.id}.jsonl`);
    if (existsSync(t)) runsCost += extractActions(readFileSync(t, 'utf8')).costUsd || 0;
  }
  const j = existsSync(join(lab, 'judge.json')) ? readJson(join(lab, 'judge.json')) : {};
  const runInfo = existsSync(join(lab, 'run.json')) ? readJson(join(lab, 'run.json')) : {};
  out(`Cost: ${plan.runs.length} runs ${money(runsCost)} + judge ${money(j.costUsd)} = ${money(runsCost + (j.costUsd || 0))}`);
  out(`Models: runs ${runInfo.model || 'unknown'}, judge ${j.model || 'unknown'}`);
  return 0;
}

function actions(o, out, err) {
  const f = resolve(o.target);
  if (!existsSync(f)) { err(`refused: ${f} does not exist`); return 1; }
  const x = extractActions(readFileSync(f, 'utf8'));
  out(renderActions(x));
  out(`model ${x.model || 'unknown'}, ${x.turns ?? '?'} turns, cost ${money(x.costUsd)}, skills offered: ${x.skills.join(', ') || 'none listed'}${x.badLines ? `, ${x.badLines} lines not JSON` : ''}`);
  return 0;
}

export async function main(argv, out = console.log, err = console.error) {
  let o;
  try { o = parseArgs(argv); } catch (e) { err(e.message); return 2; }
  try {
    switch (o.cmd) {
      case 'setup': return setup(o, out, err);
      case 'run': return await run(o, out, err);
      case 'actions': return actions(o, out, err);
      case 'blind': return blind(o, out, err);
      case 'judge': return judge(o, out, err);
      default: return unblind(o, out, err);
    }
  } catch (e) {
    err(`failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
