#!/usr/bin/env node
// check-agents.mjs: audit Claude Code agent files (subagents). Node 20+, standard library only, read only.
//
//   node check-agents.mjs [--project <root>] [--user <dir>] [--dir <folder>] [--json]
//
//   --project <root>  the project; its agents are in <root>/.claude/agents/, its skills in <root>/.claude/skills/.
//                     Default: the current directory.
//   --user <dir>      the user's Claude folder; agents in <dir>/agents/, skills in <dir>/skills/. Default: ~/.claude.
//   --dir <folder>    check the agent files in this one folder instead of the project and user scopes (for drafts
//                     and for the bundled roster). The skill folders of --project and --user are still used.
//   --json            print { agents, docs, findings } as JSON instead of text.
//
// Exit 0 when there is no error (warnings allowed), 1 when there is at least one error, 2 on a usage problem.
//
// Folders are read recursively, as Claude Code reads them. A .md file with no frontmatter is documentation kept
// beside the agents and is skipped. Node has no YAML parser, so this reads the subset agent files use: `key: value`
// lines with plain, quoted or block (`|`, `>`) values, `- item` lists, `[a, b]` lists, and nested maps (hooks,
// mcpServers, experimental), which it keeps without checking inside. Anything else is reported as a parse error; run
// `claude plugin validate <folder>` to see what Claude Code's own parser makes of it.
//
// Errors (Claude Code skips the file, or the agent quietly does something other than its file says):
//   parse               frontmatter that does not parse, or is never closed
//   name, description   missing (Claude Code skips the file), or a name with a colon, a leading dash, over 256 chars
//   duplicate           two files with the same name in one scope (Claude Code loads one, by file read order)
//   field               a frontmatter field Claude Code does not know (it ignores it without a word)
//   value               a bad effort, model, memory, isolation, permissionMode, color, boolean or number
//   covenant            the covenant block from COVENANT.md is missing, unclosed, or reworded
//   memory-read-only    memory on an agent with no Write or Edit: memory gives the agent Read, Write and Edit
//   worktree-ignore     an agent uses isolation: worktree and .claude/worktrees/ is not git-ignored
// Warnings:
//   shadowed            the same name in the project and the user scope: the project's file wins
//   glob-grep           Glob or Grep listed with Bash: on Linux and macOS they are dropped when Bash is there
//   tool                a tools entry that is not a known tool name (the tool list changes between versions)
//   description-length  a description over 200 characters (the Agent tool lists every description in every session)
//   covenant            a covenant from an older or newer roster version: run Update
//   agent-tools         the body says it starts or continues agents, and Agent or SendMessage is not in tools
//   skill               a skills entry that is not installed in the project's or the user's skill folders
//   overlap             two descriptions share so many words that delegation may pick the wrong agent
//
// Overlap score: each description is lowercased and split into words; words under three letters and common filler
// words are dropped. The score is the number of words both sets share divided by the number of words in either
// (Jaccard). At OVERLAP_THRESHOLD (0.5) or more, the pair is reported: half their words are the same.
//
// Judging whether an agent needs each tool for its job is left to the agent running the audit.
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DESCRIPTION_MAX = 200;
export const NAME_MAX = 256;
export const OVERLAP_THRESHOLD = 0.5;

// The frontmatter fields of an agent file (code.claude.com/docs/en/sub-agents, checked on 2.1.303).
export const FIELDS = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'maxTurns',
  'autoCompactWindow', 'skills', 'mcpServers', 'hooks', 'memory', 'background', 'omitClaudeMd', 'effort', 'isolation',
  'color', 'initialPrompt', 'experimental']);

export const ENUMS = {
  effort: ['low', 'medium', 'high', 'xhigh', 'max'],
  memory: ['user', 'project', 'local'],
  isolation: ['worktree'],
  permissionMode: ['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan', 'manual'],
  color: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'],
};
const BOOLEANS = ['background', 'omitClaudeMd'];
const MODEL_ALIASES = ['inherit', 'sonnet', 'opus', 'haiku', 'fable'];
// A full model ID: Anthropic's own, or a cloud provider's form of it.
const MODEL_ID = /^(claude-[a-z0-9.-]+(\[1m\])?|([a-z]{2,4}\.)?anthropic\.claude-[\w.:-]+|arn:aws:bedrock:\S+)$/;

// Built-in tool names (tools reference, 2.1.303), plus Task, the old name of Agent that still works.
export const TOOLS = new Set(['Agent', 'Task', 'Artifact', 'AskUserQuestion', 'Bash', 'CronCreate', 'CronDelete',
  'CronList', 'Edit', 'EndConversation', 'EnterPlanMode', 'EnterWorktree', 'ExitPlanMode', 'ExitWorktree', 'Glob',
  'Grep', 'ListAgents', 'ListMcpResourcesTool', 'LSP', 'Monitor', 'NotebookEdit', 'PowerShell', 'PushNotification',
  'Read', 'ReadMcpResourceTool', 'RemoteTrigger', 'ReportFindings', 'ScheduleWakeup', 'SendFeedback', 'SendMessage',
  'SendUserFile', 'ShareOnboardingGuide', 'Skill', 'SubagentHandback', 'TaskCreate', 'TaskGet', 'TaskList',
  'TaskStop', 'TaskUpdate', 'TodoWrite', 'ToolSearch', 'WaitForMcpServers', 'WebFetch', 'WebSearch', 'Workflow',
  'Write']);

const COVENANT_START = /<!--\s*covenant start: geppetto roster (\d+)\s*-->/;
const COVENANT_END = /<!--\s*covenant end\s*-->/;

// ---------------------------------------------------------------------------------------------------------------
// The YAML subset.

class YamlError extends Error {}

const ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ',
  '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0' };

// A quoted value. `raw` starts just after the opening quote and may hold later lines. Line breaks fold to spaces.
function quoted(raw, quote) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === quote && quote === "'" && raw[i + 1] === "'") { out += "'"; i++; continue; }
    if (c === quote) return { value: out, rest: raw.slice(i + 1).split('\n')[0] };
    if (c === '\\' && quote === '"') {
      const n = raw[i + 1];
      if (n === 'x' || n === 'u' || n === 'U') {
        const len = { x: 2, u: 4, U: 8 }[n];
        const hex = raw.slice(i + 2, i + 2 + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw new YamlError(`bad \\${n} escape`);
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 1 + len;
        continue;
      }
      if (n === '\n') { i++; while (raw[i + 1] === ' ' || raw[i + 1] === '\t') i++; continue; }
      if (!(n in ESCAPES)) throw new YamlError(`unknown escape \\${n}`);
      out += ESCAPES[n];
      i++;
      continue;
    }
    if (c === '\n') {
      out = out.replace(/[ \t]+$/, '');
      let breaks = 0;
      while (raw[i] === '\n') { breaks++; i++; while (raw[i] === ' ' || raw[i] === '\t') i++; }
      out += breaks > 1 ? '\n'.repeat(breaks - 1) : ' ';
      i--;
      continue;
    }
    out += c;
  }
  throw new YamlError(`a ${quote === '"' ? 'double' : 'single'}-quoted value is never closed`);
}

const stripComment = (s) => s.replace(/(^|\s+)#.*$/, '');

// A plain scalar: true, false, null, an integer, or text.
function scalar(text) {
  if (/^(true|True|TRUE)$/.test(text)) return true;
  if (/^(false|False|FALSE)$/.test(text)) return false;
  if (/^(null|Null|NULL|~)?$/.test(text)) return null;
  if (/^[-+]?\d+$/.test(text)) return Number(text);
  return text;
}

function plain(lines) {
  const parts = [];
  for (const [k, raw] of lines.entries()) {
    const line = raw.trim();
    if (k > 0 && line.startsWith('#')) break;
    const text = stripComment(line);
    if (k === 0 && /^([&*!%@`|>]|- |-$|\? )/.test(text)) {
      throw new YamlError(`a value starting with ${JSON.stringify(text[0])} is YAML this script does not read`);
    }
    if (/: |:$/.test(text)) throw new YamlError(`a plain value cannot contain ": " (quote it): ${JSON.stringify(line)}`);
    parts.push(text);
    if (text !== line) break;
  }
  return parts.filter((p, k) => p !== '' || k < parts.length - 1).join(' ').replace(/\s+/g, ' ').trim();
}

function blockScalar(header, lines) {
  const m = /^([|>])([1-9]?)([+-]?)([1-9]?)$/.exec(stripComment(header).trim());
  if (!m) throw new YamlError(`bad block header ${JSON.stringify(header)}`);
  const first = lines.find((l) => l.trim());
  const indent = Number(m[2] || m[4]) || (first ? /^ */.exec(first)[0].length : 0);
  const body = lines.map((l) => (l.trim() ? l.slice(indent) : ''));
  while (body.length && body[body.length - 1] === '') body.pop();
  if (!body.length) return '';
  let out;
  if (m[1] === '|') out = body.join('\n');
  else {
    out = '';
    let pending = 0;
    for (const [k, l] of body.entries()) {
      if (l === '') { pending++; continue; }
      if (k - pending > 0) out += pending ? '\n'.repeat(pending) : ' ';
      out += l;
      pending = 0;
    }
  }
  return m[3] === '-' ? out : `${out}\n`;
}

// Split a flow list's inside on commas that are not inside brackets or quotes.
function splitFlow(inner) {
  const items = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const c of inner) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '[' || c === '{' || c === '(') depth++;
    if (c === ']' || c === '}' || c === ')') depth--;
    if (c === ',' && depth === 0) { items.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (quote) throw new YamlError('a quoted value in a list is never closed');
  if (cur.trim()) items.push(cur);
  return items.map((s) => s.trim()).filter(Boolean);
}

function flowItem(s) {
  if (s.startsWith('"') || s.startsWith("'")) {
    const { value, rest } = quoted(s.slice(1), s[0]);
    if (rest.trim()) throw new YamlError(`text after a closing quote: ${JSON.stringify(rest.trim())}`);
    return value;
  }
  if (/^[[{]/.test(s)) return s; // nested flow value, kept as written
  return scalar(s);
}

// A flow value ([...] or {...}) that may continue on later lines.
function flow(head, more) {
  const open = head[0];
  const close = open === '[' ? ']' : '}';
  const text = [head, ...more.map((l) => l.trim())].map(stripComment).join(' ').trim();
  let depth = 0;
  let quote = null;
  let end = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0 || text[end] !== close) throw new YamlError(`a ${open}...${close} value is never closed`);
  if (text.slice(end + 1).trim()) throw new YamlError(`text after ${close}: ${JSON.stringify(text.slice(end + 1).trim())}`);
  const inner = text.slice(1, end);
  if (open === '{') return { flowMap: text.slice(0, end + 1) };
  return splitFlow(inner).map(flowItem);
}

// An indented block under a key with no value on its line: a `- item` list, or a nested map kept as its lines.
function nested(lines) {
  const content = lines.filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!content.length) return null;
  if (content.some((l) => /^\s*\t/.test(l))) throw new YamlError('tabs cannot indent YAML');
  const indent = /^ */.exec(content[0])[0].length;
  if (/^-( |$)/.test(content[0].trim())) {
    const items = [];
    for (const l of content) {
      const own = /^ */.exec(l)[0].length;
      if (own < indent) throw new YamlError(`bad indentation: ${JSON.stringify(l)}`);
      if (own > indent) { if (!items.length) throw new YamlError('bad indentation'); items[items.length - 1] = { complex: true }; continue; }
      const m = /^-(?: +(.*))?$/.exec(l.trim());
      if (!m) throw new YamlError(`a list line must start with "- ": ${JSON.stringify(l)}`);
      const v = stripComment(m[1] || '').trim();
      if (/^[^"'[{][^:]*: /.test(v) || /^[^"'[{][^:]*:$/.test(v)) { items.push({ complex: true }); continue; }
      items.push(v.startsWith('[') || v.startsWith('{') ? flow(v, []) : flowItem(v));
    }
    return items;
  }
  for (const l of content) {
    if (/^ */.exec(l)[0].length < indent) throw new YamlError(`bad indentation: ${JSON.stringify(l)}`);
    if (/^ */.exec(l)[0].length === indent && !/^(["']?)[^"'#\s][^"']*?\1\s*:(\s|$)/.test(l.trim())) {
      throw new YamlError(`a nested line is not "key: value": ${JSON.stringify(l)}`);
    }
  }
  return { nested: content.map((l) => l.slice(indent)) };
}

/** Parse an agent file. Returns { data, body, error }: data is null when the file has no frontmatter. */
export function parseFrontmatter(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0].trimEnd() !== '---') return { data: null, body: text };
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (close < 0) return { data: {}, body: '', error: 'the frontmatter has no closing --- line' };
  const front = lines.slice(1, close);
  const body = lines.slice(close + 1).join('\n');
  const data = {};
  try {
    for (let i = 0; i < front.length; i++) {
      const line = front[i];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (/^\s/.test(line)) throw new YamlError(`line ${i + 2} is indented but belongs to no key: ${JSON.stringify(line)}`);
      const m = /^(?:"([^"]+)"|'([^']+)'|([^\s"'#:][^:]*?))\s*:(?:\s+(.*))?$/.exec(line);
      if (!m) throw new YamlError(`line ${i + 2} is not "key: value": ${JSON.stringify(line)}`);
      const key = m[1] ?? m[2] ?? m[3];
      if (Object.hasOwn(data, key)) throw new YamlError(`the key ${key} appears twice`);
      const head = (m[4] || '').trim();
      let end = i + 1;
      while (end < front.length && (!front[end].trim() || /^\s/.test(front[end]))) end++;
      const more = front.slice(i + 1, end);
      i = end - 1;
      if (!head || head.startsWith('#')) data[key] = nested(more);
      else if (head.startsWith('"') || head.startsWith("'")) {
        const raw = [line.slice(line.indexOf(head[0], line.indexOf(':')) + 1), ...more].join('\n');
        const { value, rest } = quoted(raw, head[0]);
        if (stripComment(rest).trim()) throw new YamlError(`text after the closing quote: ${JSON.stringify(rest.trim())}`);
        data[key] = value;
      } else if (head.startsWith('|') || head.startsWith('>')) data[key] = blockScalar(head, more);
      else if (head.startsWith('[') || head.startsWith('{')) data[key] = flow(head, more);
      else data[key] = scalar(plain([head, ...more]));
    }
  } catch (e) {
    if (e instanceof YamlError) return { data, body, error: e.message };
    throw e;
  }
  return { data, body };
}

/** A tools or disallowedTools value as a list of entries; commas inside parentheses stay inside their entry. */
export function parseTools(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((v) => (typeof v === 'string' ? parseTools(v) : [])).filter(Boolean);
  return splitFlow(String(value));
}

const toolName = (entry) => entry.replace(/\(.*$/s, '').trim();

// ---------------------------------------------------------------------------------------------------------------
// The covenant.

const words = (s) => s.replace(/\s+/g, ' ').trim();

/** The covenant in a body: { version, block (its words, spacing ignored), error }; block is null when absent. */
export function covenantOf(text) {
  const start = COVENANT_START.exec(text);
  if (!start) return { version: null, block: null };
  const after = text.slice(start.index + start[0].length);
  const end = COVENANT_END.exec(after);
  if (!end) return { version: Number(start[1]), block: null, error: 'the covenant start marker has no end marker after it' };
  return { version: Number(start[1]), block: words(after.slice(0, end.index)) };
}

/** COVENANT.md: { version, block, text }, where text is the block to paste, from start marker to end marker. */
export function readCovenant(file = join(HERE, 'COVENANT.md')) {
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const start = COVENANT_START.exec(raw);
  const end = start && COVENANT_END.exec(raw.slice(start.index));
  if (!start || !end) throw new Error(`${file} has no covenant block`);
  const text = raw.slice(start.index, start.index + end.index + end[0].length);
  return { ...covenantOf(text), text };
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the scopes.

function mdFiles(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(f));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(f);
  }
  return out;
}

function loadScope(scope, dir) {
  const agents = [];
  const docs = [];
  for (const file of mdFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    const parsed = parseFrontmatter(text);
    const entry = { scope, file, rel: relative(dir, file).split('\\').join('/'), text, ...parsed };
    (parsed.data === null ? docs : agents).push(entry);
  }
  return { agents, docs };
}

function installedSkill(name, skillDirs, userDir) {
  const short = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
  for (const d of skillDirs) if (existsSync(join(d, short, 'SKILL.md'))) return true;
  const synced = join(userDir, 'skills', 'synced');
  if (existsSync(synced)) {
    for (const org of readdirSync(synced, { withFileTypes: true })) {
      if (org.isDirectory() && existsSync(join(synced, org.name, short, 'SKILL.md'))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// The checks.

const STOP = new Set(('the and for with from that this when then than into onto its it\'s are was were has have had '
  + 'not but all any each every one use uses used who what which your you our they them their there here also only '
  + 'can will would should does done how why out off own per via after before over under about').split(' '));

const wordSet = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)));

/** The word-overlap score of two descriptions, from 0 (no shared word) to 1 (the same words). */
export function overlapScore(a, b) {
  const x = wordSet(a);
  const y = wordSet(b);
  const union = new Set([...x, ...y]).size;
  if (!union) return 0;
  return [...x].filter((w) => y.has(w)).length / union;
}

const NEG = /\b(never|not|no|don'?t|do not|cannot|can'?t|nor)\s+(\w+\s+){0,2}$/i;
// Phrases that say the agent starts, or continues, other agents.
const STARTS = /\b(start|starts|launch|launches|spawn|spawns|dispatch|dispatches)\s+((the|a|an|one|each|every|new|fresh|its|your|all|two|more)\s+)*(sub)?(agents?|builders?|reviewers?|workers?)\b|\bAgent tool\b|\bAgent calls?\b/gi;
const CONTINUES = /\bSendMessage\b|\b(continue|continues|resume|resumes)\s+((the|a|that|each|same|this)\s+)*(sub)?(agents?|builders?|reviewers?|workers?)\b/gi;

function says(body, re) {
  for (const m of body.matchAll(re)) if (!NEG.test(body.slice(Math.max(0, m.index - 40), m.index))) return true;
  return false;
}

function checkAgent(a, ctx) {
  const out = [];
  const add = (level, check, message) => out.push({ level, check, scope: a.scope, file: a.file, rel: a.rel, message });
  if (a.error) { add('error', 'parse', `frontmatter does not parse: ${a.error}. Run claude plugin validate on the folder to compare.`); return out; }
  const d = a.data;
  const name = d.name;
  if (name === undefined || name === null || name === '') add('error', 'name', 'no name: Claude Code treats the file as documentation and never loads it');
  else {
    const n = String(name);
    if (n.includes(':')) add('error', 'name', `name "${n}" contains ":", which is reserved for plugin agents; Claude Code skips the file`);
    if (n.startsWith('-')) add('error', 'name', `name "${n}" starts with "-"; Claude Code skips the file`);
    if (n.length > NAME_MAX) add('error', 'name', `name is ${n.length} characters, over ${NAME_MAX}; Claude Code skips the file`);
  }
  const description = d.description === undefined || d.description === null ? '' : String(d.description);
  if (!description.trim()) add('error', 'description', 'no description: Claude Code skips the file');
  else if (description.length > DESCRIPTION_MAX) add('warning', 'description-length', `description is ${description.length} characters, over ${DESCRIPTION_MAX}`);

  for (const key of Object.keys(d)) if (!FIELDS.has(key)) add('error', 'field', `unknown field "${key}": Claude Code ignores it without a word`);
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (d[key] !== undefined && !allowed.includes(d[key])) add('error', 'value', `${key}: ${JSON.stringify(d[key])} is not one of ${allowed.join(', ')}`);
  }
  for (const key of BOOLEANS) {
    if (d[key] !== undefined && typeof d[key] !== 'boolean') add('error', 'value', `${key}: ${JSON.stringify(d[key])} is not true or false`);
  }
  if (d.model !== undefined && !(MODEL_ALIASES.includes(d.model) || MODEL_ID.test(String(d.model)))) {
    add('error', 'value', `model: ${JSON.stringify(d.model)} is not ${MODEL_ALIASES.join(', ')} or a full model ID`);
  }
  if (d.maxTurns !== undefined && !(Number.isInteger(d.maxTurns) && d.maxTurns > 0)) add('error', 'value', `maxTurns: ${JSON.stringify(d.maxTurns)} is not a positive whole number`);
  if (d.autoCompactWindow !== undefined && !(Number.isInteger(d.autoCompactWindow) && d.autoCompactWindow >= 100000 && d.autoCompactWindow <= 1000000)) {
    add('error', 'value', `autoCompactWindow: ${JSON.stringify(d.autoCompactWindow)} is not a token count from 100000 to 1000000`);
  }

  const listed = d.tools !== undefined && d.tools !== null;
  const tools = parseTools(d.tools);
  const denied = parseTools(d.disallowedTools);
  const names = new Set(tools.map(toolName));
  const deniedNames = new Set(denied.map(toolName));
  for (const entry of [...tools, ...denied]) {
    const t = toolName(entry);
    if (!TOOLS.has(t) && !/^mcp__/.test(t)) add('warning', 'tool', `"${entry}" is not a known tool name`);
  }
  if (names.has('Bash') && (names.has('Glob') || names.has('Grep'))) {
    add('warning', 'glob-grep', 'Glob or Grep is listed with Bash: on Linux and macOS a subagent gets them only without Bash, so search with Bash instead');
  }
  const hasTool = (t) => (listed ? names.has(t) : true) && !deniedNames.has(t);
  if (d.memory !== undefined && d.memory !== null && !hasTool('Write') && !hasTool('Edit')) {
    add('error', 'memory-read-only', `memory: ${d.memory} on an agent without Write or Edit: memory gives it Read, Write and Edit, so it is no longer read only`);
  }
  if (listed) {
    if (says(a.body, STARTS) && !names.has('Agent') && !names.has('Task')) add('warning', 'agent-tools', 'the body says it starts agents, and Agent is not in tools');
    if (says(a.body, CONTINUES) && !names.has('SendMessage')) add('warning', 'agent-tools', 'the body says it continues agents, and SendMessage is not in tools');
  }
  for (const s of Array.isArray(d.skills) ? d.skills : d.skills ? [d.skills] : []) {
    if (typeof s === 'string' && !installedSkill(s, ctx.skillDirs, ctx.userDir)) add('warning', 'skill', `skills entry "${s}" is not installed in the project's or the user's skill folders; Claude Code skips it`);
  }

  const cov = covenantOf(a.body);
  if (cov.error) add('error', 'covenant', cov.error);
  else if (cov.block === null) add('error', 'covenant', 'no covenant block: paste the block from COVENANT.md');
  else if (cov.block !== ctx.covenant.block) {
    if (cov.version === ctx.covenant.version) add('error', 'covenant', 'the covenant block differs from COVENANT.md: the laws are not to be tuned');
    else {
      const older = cov.version < ctx.covenant.version;
      add('warning', 'covenant', `the covenant is from roster ${cov.version}, the bundle is roster ${ctx.covenant.version}${older ? ': run Update' : ': this copy is newer than the bundle, update the skill'}`);
    }
  }
  return out;
}

function gitIgnored(root, path) {
  const r = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', path], { encoding: 'utf8' });
  if (r.error || r.status === 128) return null;
  return r.status === 0;
}

/** Audit the agents. Returns { agents, docs, findings }. */
export function audit({ project = process.cwd(), user = join(homedir(), '.claude'), dir, covenant } = {}) {
  const cov = covenant || readCovenant();
  const scopes = dir ? [['dir', dir]] : [['project', join(project, '.claude', 'agents')], ['user', join(user, 'agents')]];
  const agents = [];
  const docs = [];
  for (const [scope, path] of scopes) {
    const s = loadScope(scope, path);
    agents.push(...s.agents);
    docs.push(...s.docs);
  }
  const ctx = { covenant: cov, skillDirs: [join(project, '.claude', 'skills'), join(user, 'skills')], userDir: user };
  const findings = agents.flatMap((a) => checkAgent(a, ctx));
  const named = agents.filter((a) => !a.error && a.data.name !== undefined && a.data.name !== null && a.data.name !== '');

  const byScope = new Map();
  for (const a of named) {
    const key = `${a.scope}\0${a.data.name}`;
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key).push(a);
  }
  for (const group of byScope.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;
    findings.push({ level: 'error', check: 'duplicate', scope: first.scope, file: first.file, rel: first.rel,
      message: `name "${first.data.name}" is also used by ${rest.map((r) => r.rel).join(', ')}: Claude Code loads only one of them, by file read order` });
  }
  for (const p of named.filter((a) => a.scope === 'project')) {
    const u = named.find((a) => a.scope === 'user' && a.data.name === p.data.name);
    if (u) findings.push({ level: 'warning', check: 'shadowed', scope: 'user', file: u.file, rel: u.rel, message: `name "${u.data.name}" is also in the project (${p.rel}): the project's file wins over the user's` });
  }
  const seen = new Set();
  const unique = named.filter((a) => { const k = `${a.data.name}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const score = overlapScore(unique[i].data.description, unique[j].data.description);
      if (score >= OVERLAP_THRESHOLD) {
        findings.push({ level: 'warning', check: 'overlap', scope: unique[j].scope, file: unique[j].file, rel: unique[j].rel,
          message: `description overlaps "${unique[i].data.name}" (${unique[i].rel}) with a word score of ${score.toFixed(2)}: say what makes each one the right pick` });
      }
    }
  }
  if (!dir && named.some((a) => a.data.isolation === 'worktree')) {
    const ignored = gitIgnored(project, '.claude/worktrees/probe');
    const users = named.filter((a) => a.data.isolation === 'worktree').map((a) => a.data.name).join(', ');
    if (ignored === false) {
      findings.push({ level: 'error', check: 'worktree-ignore', scope: 'project', file: join(project, '.gitignore'), rel: '.gitignore',
        message: `${users} use isolation: worktree, and .claude/worktrees/ is not git-ignored: add it to .gitignore so worktrees never get committed` });
    } else if (ignored === null) {
      findings.push({ level: 'warning', check: 'worktree-ignore', scope: 'project', file: project, rel: '.',
        message: `${users} use isolation: worktree, and git could not say whether .claude/worktrees/ is ignored (not a git repository?)` });
    }
  }
  return { agents: agents.map(({ scope, file, rel, data }) => ({ scope, file, rel, data })), docs: docs.map(({ scope, file, rel }) => ({ scope, file, rel })), findings };
}

// ---------------------------------------------------------------------------------------------------------------
// The command line.

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (['--project', '--user', '--dir'].includes(a) && argv[i + 1]) opts[a.slice(2)] = resolve(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function format(result, opts) {
  const lines = [];
  const counts = {};
  for (const a of result.agents) counts[a.scope] = (counts[a.scope] || 0) + 1;
  const where = opts.dir ? opts.dir : `${join(opts.project || process.cwd(), '.claude', 'agents')} and ${join(opts.user || join(homedir(), '.claude'), 'agents')}`;
  lines.push(`check-agents: ${result.agents.length} agent file(s) in ${where}${Object.keys(counts).length ? ` (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}, ${result.docs.length} documentation file(s) skipped`);
  for (const f of [...result.findings].sort((x, y) => (x.level === y.level ? 0 : x.level === 'error' ? -1 : 1))) {
    lines.push(`${f.level === 'error' ? 'ERROR  ' : 'warning'}  ${f.scope}  ${f.rel}  ${f.check}: ${f.message}`);
  }
  const e = result.findings.filter((f) => f.level === 'error').length;
  const w = result.findings.length - e;
  lines.push(`${e} error(s), ${w} warning(s)`);
  return lines.join('\n');
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error(`${e.message}\nUsage: node check-agents.mjs [--project <root>] [--user <dir>] [--dir <folder>] [--json]`);
    process.exit(2);
  }
  const result = audit(opts);
  console.log(opts.json ? JSON.stringify(result, null, 2) : format(result, opts));
  process.exit(result.findings.some((f) => f.level === 'error') ? 1 : 0);
}

const invoked = process.argv[1] && (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invoked) main();
