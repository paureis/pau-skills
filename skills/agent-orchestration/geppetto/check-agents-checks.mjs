// check-agents-checks.mjs: the constants, the covenant, reading the scopes and the checks on one agent file, for
// check-agents.mjs. It runs nothing on its own.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseTools, toolName } from './check-agents-yaml.mjs';

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
const MODEL_ALIASES = ['inherit', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'opusplan', 'default'];
// A full model ID: Anthropic's own, or a cloud provider's form of it.
const MODEL_ID = /^(claude-[a-z0-9.@-]+|([a-z]{2,6}\.)?anthropic\.claude-[\w.:@-]+|arn:aws:bedrock:\S+)(\[1m\])?$/i;

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
    const entry = { scope, scopeDir: dir, file, rel: relative(dir, file).split('\\').join('/'), text, ...parsed };
    // No frontmatter, or frontmatter with no name: Claude Code treats the file as documentation kept beside the agents.
    const named = parsed.data && parsed.data.name !== undefined && parsed.data.name !== null && parsed.data.name !== '';
    const doc = parsed.data === null || (!named && !parsed.unclosed && !parsed.failed.includes('name'));
    (doc ? docs : agents).push(entry);
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

/** How to run claude plugin validate on a folder of agents: it reads one only at a path ending in .claude/agents. */
export function validateHint(dir) {
  if (basename(dir) === 'agents' && basename(dirname(dir)) === '.claude') return `Run claude plugin validate ${dir}`;
  const quoted = `'${dir.replace(/'/g, `'\\''`)}'`;
  return `This folder does not end in .claude/agents, and claude plugin validate reads a folder of agents only there, so validate a copy: d=$(mktemp -d) && mkdir "$d/.claude" && cp -R ${quoted} "$d/.claude/agents" && claude plugin validate "$d/.claude/agents"`;
}

function checkAgent(a, ctx) {
  const out = [];
  const add = (level, check, message) => out.push({ level, check, scope: a.scope, file: a.file, rel: a.rel, message });
  if (a.unclosed) {
    add('warning', 'parse', 'the frontmatter has no closing --- line: Claude Code reads the file as documentation and never loads it');
    return out;
  }
  if (a.error) {
    add('warning', 'parse', `this script cannot read the frontmatter (${a.error}). ${validateHint(a.scopeDir)}. It uses Claude Code's own parser, and a parse error there means Claude Code skips this file`);
  }
  const ok = (key) => !a.failed.includes(key);
  for (const key of a.repeated) add('warning', 'duplicate-key', `the key ${key} appears more than once: Claude Code keeps the last one`);
  const d = a.data;
  const name = d.name;
  if (ok('name') && name !== undefined && name !== null && name !== '') {
    const n = String(name);
    if (n.includes(':')) add('error', 'name', `name "${n}" contains ":", which is reserved for plugin agents; Claude Code skips the file`);
    if (n.startsWith('-')) add('error', 'name', `name "${n}" starts with "-"; Claude Code skips the file`);
    if (n.length > NAME_MAX) add('error', 'name', `name is ${n.length} characters, over ${NAME_MAX}; Claude Code skips the file`);
  }
  const description = d.description === undefined || d.description === null ? '' : String(d.description);
  if (!ok('description')) { /* reported as a parse warning */ } else if (!description.trim()) add('error', 'description', 'no description: Claude Code skips the file');
  else if (description.length > DESCRIPTION_MAX) add('warning', 'description-length', `description is ${description.length} characters, over ${DESCRIPTION_MAX}`);

  for (const key of Object.keys(d)) if (!FIELDS.has(key)) add('error', 'field', `unknown field "${key}": Claude Code ignores it without a word`);
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (d[key] !== undefined && !allowed.includes(d[key])) add('error', 'value', `${key}: ${JSON.stringify(d[key])} is not one of ${allowed.join(', ')}`);
  }
  for (const key of BOOLEANS) {
    if (d[key] !== undefined && typeof d[key] !== 'boolean') add('error', 'value', `${key}: ${JSON.stringify(d[key])} is not true or false`);
  }
  if (d.model !== undefined && !(MODEL_ALIASES.includes(String(d.model).replace(/\[1m\]$/i, '')) || MODEL_ID.test(String(d.model)))) {
    add('warning', 'value', `model: ${JSON.stringify(d.model)} is not a model name this script knows (${MODEL_ALIASES.join(', ')} or a full model ID); check it against what --model takes`);
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
  for (const key of ['tools', 'disallowedTools']) {
    if (Array.isArray(d[key]) && d[key].some((v) => typeof v !== 'string')) add('warning', 'tool', `a ${key} entry reads as a map, not a tool name: quote it`);
  }
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
  // A personal agent in the user's folder with no covenant was not made by geppetto: the covenant is a suggestion
  // there. A file that carries the roster marker is held to the roster in every scope, by the unclosed and reworded
  // checks below.
  const required = a.scope !== 'user';
  if (cov.error) add('error', 'covenant', cov.error);
  else if (cov.block === null) {
    if (required) add('error', 'covenant', 'no covenant block: paste the block from COVENANT.md');
    else add('warning', 'covenant', "no covenant block: this agent was not made by geppetto; add the covenant if it should follow the roster's laws");
  } else if (cov.version !== ctx.covenant.version) {
    const older = cov.version < ctx.covenant.version;
    add('warning', 'covenant', `the covenant is from roster ${cov.version}, the bundle is roster ${ctx.covenant.version}${older ? ': run Update' : ': this copy is newer than the bundle, update the skill'}`);
  } else if (cov.block !== ctx.covenant.block) add('error', 'covenant', 'the covenant block differs from COVENANT.md: the laws are not to be tuned');
  return out;
}

export { loadScope, checkAgent };
