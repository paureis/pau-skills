// skill-eval module: the word guard, how a run and the reviewer are started, reading a transcript, and the rubric and
// score parsing. skill-eval.mjs re-exports the public names.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

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
 * The only variables a run gets from this environment, plus LC_* and the names passed with --pass-env: the search
 * path, the shell, the locale, the temporary folder, and the proxy and certificate variables a container needs to
 * reach the network. Everything else stays out: this session's identity (CLAUDECODE, CLAUDE_CODE_*), CLAUDE_CONFIG_DIR
 * (which would undo the empty HOME), ANTHROPIC_*, IDE variables, PWD and the like.
 */
export const ALLOWED_ENV = ['PATH', 'SHELL', 'TERM', 'LANG', 'LANGUAGE', 'TZ', 'TMPDIR', 'TMP', 'TEMP',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'all_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'GIT_SSL_CAINFO',
  'NIX_SSL_CERT_FILE'];

/** The environment for a run: the allowlist and the passed names from `env`, with HOME set to `home`. */
export function childEnv(env, home, pass = []) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (ALLOWED_ENV.includes(k) || /^LC_[A-Z]+$/.test(k) || pass.includes(k)) out[k] = v;
  }
  out.HOME = home;
  return out;
}

/** Why this platform cannot start `cmd` with its arguments intact, or null. */
export function platformProblem(platform, cmd) {
  if (platform === 'win32' && !/\.(mjs|js)$/.test(cmd)) {
    return 'Windows is not supported: starting claude there goes through cmd.exe, which splits and rewrites the prompt and drops the empty --tools value. Run skill-eval under WSL, Linux or macOS';
  }
  return null;
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

const claudeName = () => process.env.SKILL_EVAL_CLAUDE || 'claude';

function claudeCommand(argv) {
  const cmd = claudeName();
  if (/\.(mjs|js)$/.test(cmd)) return { file: process.execPath, args: [cmd, ...argv] };
  return { file: cmd, args: argv };
}

/** Null when `claude auth status` reports a login under `home`, else the reason. */
function loginProblem(home, pass) {
  const { file, args } = claudeCommand(['auth', 'status']);
  const cwd = mkdtempSync(join(tmpdir(), 'a-'));
  try {
    const r = spawnSync(file, args, { cwd, env: childEnv(process.env, home, pass), encoding: 'utf8', timeout: 120_000 });
    let loggedIn = false;
    try { loggedIn = JSON.parse(r.stdout).loggedIn === true; } catch { /* not JSON */ }
    return r.status === 0 && loggedIn ? null : `claude auth status: exit ${r.status}, ${firstLine(r.stdout || r.stderr) || 'no output'}`;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** Check the login the runs will have; returns an error sentence or null. */
function checkLogin(o) {
  const home = o.realHome ? process.env.HOME : mkdtempSync(join(tmpdir(), 'h-'));
  try {
    const why = loginProblem(home, o.passEnv);
    if (!why) return null;
    return o.realHome
      ? `claude is not logged in with your own HOME either (${why})`
      : `a run under an empty HOME is not logged in (${why}). Pass the variable that holds your login with --pass-env (for example ANTHROPIC_API_KEY), or use --real-home, which runs with your HOME and only the project's settings`;
  } finally {
    if (!o.realHome) rmSync(home, { recursive: true, force: true });
  }
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

/** The run's own last message: not evidence, unless the reply is the work product (`work`). */
export function finalSection(x, { work = false } = {}) {
  const heading = work
    ? '## What it said at the end (the work product: grade it, and check what it says about its own steps against them)'
    : '## What it said at the end (not evidence: grade what it did and what it changed, not this)';
  return [heading, '', x.finalText || '(nothing)', ''].join('\n');
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
export const MAX_RUNS = 26;
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
  const lines = outsideFences(withoutComments(text));
  const n = lines.filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
  if (n < MIN_CRITERIA || n > MAX_CRITERIA) errors.push(`the rubric has ${n} numbered criteria; it needs ${MIN_CRITERIA} to ${MAX_CRITERIA}`);
  const left = lines.join('\n').match(/<(criterion|one line)\b[^>]*>/i);
  if (left) errors.push(`the rubric still has a template placeholder: ${left[0]}`);
  return errors;
}

/** A Markdown text without its HTML comments, which are notes for you and never reach the reviewer. */
export const withoutComments = (text) => String(text).replace(/<!--[\s\S]*?-->\s*/g, '');

export function rubricTemplate() {
  return `# Rubric

<!-- Only you read this comment: blind leaves comments out of the reviewer's copy. The rest of the file goes to the
reviewer, never to a run. It must not say which variant is which or what changed between them. Write 3 to 6
criteria that can be checked from what a run did (files opened, commands run, edits made) and what it changed,
specific to this task. Replace every placeholder line. -->

Task: <one line: what every run was asked to do, in words that fit every variant>

1. <criterion: a behaviour the change should cause, checkable in the actions or the diff>
2. <criterion>
3. <criterion>
`;
}

const SCORE_LINE = /^\s*(?:[-+]\s*)?([A-Z])\s*:\s*([1-5])\s*\/\s*5(?!\d)/;
const LOOKS_LIKE_SCORE = /^\s*(?:[-+]\s*)?([A-Z])\s*[:=]\s*\d/;

/**
 * Scores in the "Criterion <n>: <text>" then "  A: 4/5  evidence" format. A block holds only score lines (blank lines
 * before its first score are allowed) and ends at the first other line, so a later note such as "A: 2 retries" is
 * never read as a score. Returns { criteria: [{ n, text, scores: { A: 4 } }], problems: [sentences] }.
 */
export function parseScores(text) {
  const criteria = [];
  const problems = [];
  let cur = null;
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/[*`]/g, '');
    const c = /^\s*#*\s*Criterion\s+(\d+)\s*[:.)]?\s*(.*)$/i.exec(line);
    if (c) { cur = { n: Number(c[1]), text: c[2].trim(), scores: {} }; criteria.push(cur); return; }
    if (!line.trim()) { if (cur && Object.keys(cur.scores).length) cur = null; return; }
    const s = SCORE_LINE.exec(line);
    if (cur && s) {
      if (s[1] in cur.scores) problems.push(`line ${i + 1}: ${s[1]} is scored twice in criterion ${cur.n}; the first score counts`);
      else cur.scores[s[1]] = Number(s[2]);
      return;
    }
    if (cur && LOOKS_LIKE_SCORE.test(line)) { problems.push(`line ${i + 1}: a score without /5 is not read: ${raw.trim()}`); return; }
    if (!cur && (s || LOOKS_LIKE_SCORE.test(line))) problems.push(`line ${i + 1}: a score line outside a criterion block is not read: ${raw.trim()}`);
    cur = null;
  });
  return { criteria, problems };
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

export { escapeRe, claudeName, claudeCommand, checkLogin, replaceAll };
