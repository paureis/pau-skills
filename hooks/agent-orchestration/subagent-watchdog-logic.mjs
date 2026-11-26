// Subagent watchdog, the pure part: every decision the hook makes, with no file I/O, so the tests can call it directly.
// The hook itself (subagent-watchdog.mjs) reads stdin and the config, keeps the state files and prints the output.
//
// What it watches, and why: a subagent sometimes spends half an hour rerunning the same tests for a one-line change,
// loops, or stalls, and nobody notices until it reports. Decision 22 sets the limits: never cut off a healthy long
// run, stopping an agent needs a yes (the owner's or the orchestrator's, through TaskStop), a hook that works with no
// skill and in cloud sessions. Decision 23 sets the design, and decision 30 the owner's four answers.
//
// Inside a subagent (the event carries agent_id):
//   - A repeat is the same shell command (Bash or PowerShell), white space collapsed, run again with no edit in
//     between. A note on the 3rd run, an ask on the 5th and every 5th after it.
//   - No progress is a stretch of tool calls with no edit: one note on the first call at or past 40, an ask on the
//     first call at or past 80, 160, ... (the last level asked is kept; both reset at an edit). Read-only agent
//     types skip this rule, and get repeat notes but no repeat asks.
//   - An exempt call (an edit, a git commit, SubagentHandback, SendMessage) may get a note but never an ask, so a
//     loop of failing edits or commits is still noticed.
//   - An edit is Edit, Write, MultiEdit or NotebookEdit with a path of 1 to 4,096 characters, wherever the file is (a
//     sibling worktree, the scratchpad: q38.md item 1), or a git commit (found with commands() from
//     hooks/lib/shell.mjs, which also looks inside bash -c). It counts at PostToolUse, so a refused edit is no edit;
//     PostToolUseFailure only ends the call in flight.
//   - The note is additionalContext and blocks nothing. The ask is permissionDecision "ask": interactive, the owner
//     is asked; headless (claude -p), that one call is refused with the reason and the agent carries on. The hook
//     cannot tell which, so the reason speaks to both, and tells a healthy run how to go on.
// In the main session (no agent_id): on UserPromptSubmit and PreToolUse, when at least one subagent is flagged, one
// line per running subagent, at most once every 5 minutes. Flags: looks stuck (no tool call started or finished for
// 10 minutes and none in flight), a command in flight for 30 minutes, a repeat at the note, no edit at the note. An
// Agent or Task call with a tool_use_id is a wait until the PostToolUse or PostToolUseFailure with the same id (at
// most 32, oldest dropped), so parallel Agent calls are tracked one by one; an agent with a wait, or with an Agent or
// Task call in flight, reads "waiting" and is never flagged stuck or long-running, nor dropped. An agent with no call
// in flight, no wait and no event for 60 minutes is dropped from the state: it may have ended with no stop event, as
// an agent stopped with TaskStop does. A main-session PostToolUse for TaskStop removes the agent it names.
//
// Facts it rests on, from two headless prototypes (decision 23, and Claude Code 2.1.330 on 2026-11-23): subagent hook
// events carry the main session's session_id and their own agent_id and agent_type; main-session events carry no
// agent_id. A refused call has a PreToolUse and no PostToolUse, so a call counts as in flight only until the agent's
// next event. A failed shell command fires PostToolUseFailure. TaskStop's task_id is the agent_id the agent's own
// hooks carry, and a stopped agent gets no SubagentStop.
//
// The state of one agent is { type, start, last, calls, sinceEdit, edit, runs, top, flight, waits, noted, asked },
// times in Date.now() milliseconds; runs maps a key ("h" and 16 characters of the command's SHA-256) to its count, at most 200 keys. The
// main session's state is { shownAt, agents: Map }; a Map, so an id such as __proto__ is a plain entry. step() returns
// the new state, the output or null, and which agents to write or remove; the hook does the I/O.
import { createHash } from 'node:crypto';
import { commands, gitSubcommand } from '../lib/shell.mjs';

export const NAME = 'subagent-watchdog';
export const DEFAULTS = Object.freeze({
  repeatNote: 3, repeatAsk: 5, noEditNote: 40, noEditAsk: 80,
  readOnlyAgents: Object.freeze(['reviewer', 'Explore', 'Plan', 'claude-code-guide', 'web-fetch', 'eng-lead']),
});
const MINUTE = 60 * 1000;
export const LIMITS = Object.freeze({
  stuck: 10 * MINUTE, long: 30 * MINUTE, throttle: 5 * MINUTE, drop: 60 * MINUTE, day: 24 * 60 * MINUTE,
  keys: 200, shown: 80, message: 120, path: 4096, type: 200, waits: 32, waitId: 128,
});
// Every regular expression in this file. id: a session id or an agent id, also the file name of an agent's state.
export const PATTERNS = Object.freeze({ id: /^[A-Za-z0-9_-]{1,128}$/, key: /^h[A-Za-z0-9_-]{16}$/ });

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const QUIET_TOOLS = new Set(['SubagentHandback', 'SendMessage']);
const WAIT_TOOLS = new Set(['Agent', 'Task']);
const SUB_EVENTS = new Set(['SubagentStart', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'SubagentStop']);
const OFF = '{"hooks": {"subagent-watchdog": false}}';

export const validId = (v) => typeof v === 'string' && PATTERNS.id.test(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const whole = (v, fallback) => (Number.isInteger(v) && v > 0 ? v : fallback);
const minutes = (ms) => Math.floor(ms / MINUTE);

/** The options, from the "subagent-watchdog" object of the config. A value that is not valid keeps its default. */
export function resolveOptions(raw) {
  const o = isObject(raw) ? raw : {};
  return {
    repeatNote: whole(o.repeatNote, DEFAULTS.repeatNote),
    repeatAsk: whole(o.repeatAsk, DEFAULTS.repeatAsk),
    noEditNote: whole(o.noEditNote, DEFAULTS.noEditNote),
    noEditAsk: whole(o.noEditAsk, DEFAULTS.noEditAsk),
    readOnlyAgents: Array.isArray(o.readOnlyAgents) ? o.readOnlyAgents.filter((s) => typeof s === 'string') : [...DEFAULTS.readOnlyAgents],
  };
}

export const normalizeCommand = (command) => String(command).trim().replace(/\s+/g, ' ');
const commandKey = (norm) => 'h' + createHash('sha256').update(norm).digest('base64url').slice(0, 16);

/** True when the type, or its part after the last ":" (plugin:reviewer), is in the read-only list. */
export function isReadOnly(type, list) {
  return list.includes(type) || list.includes(type.slice(type.lastIndexOf(':') + 1));
}

function isCommit(command) {
  try {
    return commands(command).some((c) => c.program === 'git' && gitSubcommand(c.args).sub === 'commit');
  } catch {
    return false; // commands() overflows the stack on a huge bash -c payload: not a commit
  }
}

/**
 * True when the tool call is an edit: an edit tool with a path of 1 to 4,096 characters, wherever the file is, or a
 * shell command that runs git commit.
 */
export function isEdit(input) {
  const tool = input.tool_name;
  const ti = isObject(input.tool_input) ? input.tool_input : {};
  if (EDIT_TOOLS.has(tool)) {
    const p = tool === 'NotebookEdit' ? ti.notebook_path : ti.file_path;
    return typeof p === 'string' && p !== '' && p.length <= LIMITS.path;
  }
  return SHELL_TOOLS.has(tool) && typeof ti.command === 'string' && isCommit(ti.command);
}

export const emptyState = () => ({ shownAt: 0, agents: new Map() });
const newAgent = (type, now) => ({
  type, start: now, last: now, calls: 0, sinceEdit: 0, edit: 0, runs: {}, top: null, flight: null, waits: [], noted: false, asked: 0,
});
/** A tool_use_id that can key a wait: a string of 1 to 128 characters. */
const waitId = (v) => (typeof v === 'string' && v.length >= 1 && v.length <= LIMITS.waitId ? v : null);

/** One agent's state from its file's text, or null when it is not a valid state. Strings are capped. */
export function parseAgent(text) {
  let t = String(text);
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  let v;
  try { v = JSON.parse(t); } catch { return null; }
  if (!isObject(v) || typeof v.type !== 'string' || !isObject(v.runs)) return null;
  if (![v.start, v.last, v.calls, v.sinceEdit, v.edit].every(Number.isFinite)) return null;
  const runs = {};
  const keys = Object.keys(v.runs);
  if (keys.length > LIMITS.keys) return null;
  for (const k of keys) {
    if (!PATTERNS.key.test(k) || !Number.isInteger(v.runs[k]) || v.runs[k] < 1) return null;
    runs[k] = v.runs[k];
  }
  let top = null;
  if (v.top !== null) {
    if (!isObject(v.top) || !Number.isInteger(v.top.n) || typeof v.top.cmd !== 'string') return null;
    top = { n: v.top.n, cmd: v.top.cmd.slice(0, LIMITS.shown) };
  }
  let flight = null;
  if (v.flight !== null) {
    const f = v.flight;
    if (!isObject(f) || typeof f.tool !== 'string' || !(f.cmd === null || typeof f.cmd === 'string') || !Number.isFinite(f.at)) return null;
    flight = { tool: f.tool.slice(0, LIMITS.type), cmd: f.cmd === null ? null : f.cmd.slice(0, LIMITS.shown), at: f.at };
  }
  const waits = v.waits === undefined ? [] : v.waits;
  if (!Array.isArray(waits) || !waits.every((w) => isObject(w) && waitId(w.id) !== null && Number.isFinite(w.at))) return null;
  const noted = v.noted === undefined ? false : v.noted;
  const asked = v.asked === undefined ? 0 : v.asked;
  if (typeof noted !== 'boolean' || !Number.isInteger(asked) || asked < 0) return null;
  return {
    type: v.type.slice(0, LIMITS.type), start: v.start, last: v.last, calls: v.calls, sinceEdit: v.sinceEdit, edit: v.edit, runs, top, flight,
    waits: waits.slice(-LIMITS.waits).map((w) => ({ id: w.id, at: w.at })), noted, asked,
  };
}

export const serializeAgent = (a) => JSON.stringify({
  type: a.type, start: a.start, last: a.last, calls: a.calls, sinceEdit: a.sinceEdit, edit: a.edit, runs: a.runs, top: a.top, flight: a.flight,
  waits: a.waits, noted: a.noted, asked: a.asked,
});

/** The main session's last status time from the "shown" file's text, or 0. */
export function parseShown(text) {
  const n = Number(String(text).trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Who an event is for: { who: 'sub', id }, { who: 'main', stop } or { who: 'main', status: true }, or null to ignore. */
export function route(input) {
  if (!isObject(input)) return null;
  const event = input.hook_event_name;
  const id = input.agent_id;
  if (id !== undefined) return validId(id) && SUB_EVENTS.has(event) ? { who: 'sub', id } : null;
  if (event === 'UserPromptSubmit' || event === 'PreToolUse') return { who: 'main', status: true };
  const task = isObject(input.tool_input) ? input.tool_input.task_id : undefined;
  if (event === 'PostToolUse' && input.tool_name === 'TaskStop' && validId(task)) return { who: 'main', stop: task };
  return null;
}

const nothing = (state) => ({ state, output: null, write: [], remove: [], shown: false, changed: false });
const removed = (state, id) => {
  const agents = new Map(state.agents);
  agents.delete(id);
  return { state: { ...state, agents }, output: null, write: [], remove: [id], shown: false, changed: true };
};

const SOFT = 'If it is (a poll, a fix made through the shell, a mutation run), go on.';
const noteText = (parts) =>
  `[subagent-watchdog] ${parts.join(' ')} If this is not getting you anywhere, change something, or report what you ` +
  `have and what blocks you. ${SOFT}`;
const askText = (type, id, parts) =>
  `[subagent-watchdog] Agent ${type || '(no type)'} ${id}: ${parts.join(' ')} If you are not making progress, stop ` +
  'and report what you have and what blocks you. If you are (a poll, a fix made through the shell, a mutation run), ' +
  'say so in one line and go on: only this one call was refused. To the owner: allowing lets the agent go on, and ' +
  `denying refuses only this one call. Turn the watchdog off with ${OFF} in .claude/pau-skills.json.`;

function subagent(state, input, id, now, o) {
  const event = input.hook_event_name;
  if (event === 'SubagentStop') return removed(state, id);
  const type = typeof input.agent_type === 'string' ? input.agent_type.slice(0, LIMITS.type) : '';
  const prev = state.agents.get(id);
  const a = prev ? { ...prev, runs: { ...prev.runs } } : newAgent(type, now);
  const agents = new Map(state.agents);
  agents.set(id, a);
  const done = (output = null) => ({ state: { ...state, agents }, output, write: [id], remove: [], shown: false, changed: true });
  if (event === 'SubagentStart') {
    a.type = type;
    a.last = now;
    return done();
  }
  if (event === 'PostToolUse' || event === 'PostToolUseFailure') {
    a.last = now;
    a.flight = null;
    const ended = waitId(input.tool_use_id);
    if (ended !== null) a.waits = a.waits.filter((w) => w.id !== ended);
    if (event === 'PostToolUse' && isEdit(input)) Object.assign(a, { sinceEdit: 0, runs: {}, top: null, edit: now, noted: false, asked: 0 });
    return done();
  }
  // PreToolUse
  const tool = typeof input.tool_name === 'string' ? input.tool_name.slice(0, LIMITS.type) : '';
  const command = isObject(input.tool_input) ? input.tool_input.command : undefined;
  const shell = SHELL_TOOLS.has(tool) && typeof command === 'string';
  const norm = shell ? normalizeCommand(command) : '';
  a.calls += 1;
  a.sinceEdit += 1;
  a.last = now;
  a.flight = { tool, cmd: shell ? norm.slice(0, LIMITS.shown) : null, at: now };
  const started = WAIT_TOOLS.has(tool) ? waitId(input.tool_use_id) : null;
  if (started !== null && !a.waits.some((w) => w.id === started)) a.waits = [...a.waits, { id: started, at: now }].slice(-LIMITS.waits);
  let n = 0;
  if (shell) {
    const key = commandKey(norm);
    if (!(key in a.runs) && Object.keys(a.runs).length >= LIMITS.keys) delete a.runs[Object.keys(a.runs)[0]];
    n = a.runs[key] = (a.runs[key] || 0) + 1;
    if (!a.top || n > a.top.n) a.top = { n, cmd: norm.slice(0, LIMITS.shown) };
  }
  const exempt = QUIET_TOOLS.has(tool) || isEdit(input);
  const readOnly = isReadOnly(a.type, o.readOnlyAgents);
  const k = a.sinceEdit;
  const level = Math.floor(k / o.noEditAsk);
  const repeatAsk = shell && !exempt && !readOnly && n >= o.repeatAsk && (n - o.repeatAsk) % o.repeatAsk === 0;
  const noEditAsk = !exempt && !readOnly && k >= o.noEditAsk && level > a.asked;
  const noEditNote = !readOnly && !a.noted && k >= o.noEditNote;
  const repeat = repeatAsk || (shell && n === o.repeatNote);
  const noEdit = noEditAsk || noEditNote;
  if (noEditNote) a.noted = true;
  if (noEditAsk) a.asked = level;
  if (!repeat && !noEdit) return done();
  const shown = norm.slice(0, LIMITS.message);
  const parts = [];
  if (repeat) parts.push(`the same command ran ${n} times with no edit in between: \`${shown}\`.`);
  if (noEdit) parts.push(`${k} tool calls since the last edit.`);
  if (repeatAsk || noEditAsk) {
    return done({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: askText(a.type, id, parts) } });
  }
  return done({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: noteText(parts.map((p) => p[0].toUpperCase() + p.slice(1))) } });
}

const oneLine = (s, n) => normalizeCommand(s).slice(0, n);

/** The flags of one agent at `now`, in words, and whether it is dropped. */
export function judge(a, now, o) {
  const flags = [];
  const idle = now - a.last;
  const waiting = a.waits.length > 0 || (a.flight !== null && WAIT_TOOLS.has(a.flight.tool));
  if (a.flight === null && !waiting && idle >= LIMITS.stuck) flags.push(`looks stuck: no tool call for ${minutes(idle)} minutes`);
  if (a.flight !== null && !waiting && now - a.flight.at >= LIMITS.long) flags.push(`one call has run for ${minutes(now - a.flight.at)} minutes`);
  if (a.top && a.top.n >= o.repeatNote) flags.push(`the same command ran ${a.top.n} times with no edit in between`);
  if (!isReadOnly(a.type, o.readOnlyAgents) && a.sinceEdit >= o.noEditNote) flags.push(`${a.sinceEdit} tool calls with no edit`);
  return { flags, drop: a.flight === null && !waiting && idle >= LIMITS.drop, waiting };
}

function line(id, a, now, { flags, waiting }) {
  const bits = [`${oneLine(a.type, LIMITS.type) || '(no type)'} ${id}: ${minutes(now - a.start)} minutes, ${a.calls} tool calls, ${a.sinceEdit} since the last edit`];
  bits.push(a.top ? `top repeat ${a.top.n} runs of \`${oneLine(a.top.cmd, LIMITS.shown)}\`` : 'no repeats');
  if (a.flight !== null) {
    const m = minutes(now - a.flight.at);
    const what = a.flight.cmd !== null ? `\`${oneLine(a.flight.cmd, LIMITS.shown)}\`` : oneLine(a.flight.tool, LIMITS.type);
    if (!WAIT_TOOLS.has(a.flight.tool)) bits.push(`running ${what} for ${m} minutes`);
    else if (a.waits.length === 0) bits.push(`waiting on a subagent for ${m} minutes`);
  }
  if (a.waits.length) {
    const n = a.waits.length;
    bits.push(`waiting on ${n} subagent${n === 1 ? '' : 's'} for ${minutes(now - Math.min(...a.waits.map((w) => w.at)))} minutes`);
  }
  if (flags.length) bits.push(`flagged: ${flags.join('; ')}`);
  return `- ${bits.join(', ')}`;
}

function status(state, input, now, o) {
  if (state.agents.size === 0) return nothing(state);
  const rows = [...state.agents]
    .sort(([x, a], [y, b]) => a.start - b.start || (x < y ? -1 : x > y ? 1 : 0))
    .map(([id, a]) => ({ id, a, ...judge(a, now, o) }));
  if (!rows.some((r) => r.flags.length) || now - state.shownAt < LIMITS.throttle) return nothing(state);
  const kept = rows.filter((r) => !r.drop);
  const gone = rows.filter((r) => r.drop);
  const text = [
    `[subagent-watchdog] Subagents running now, at least one flagged (shown at most once every 5 minutes):`,
    ...kept.map((r) => line(r.id, r.a, now, r)),
    ...gone.map((r) => `- dropped ${oneLine(r.a.type, LIMITS.type) || '(no type)'} ${r.id}: no event for ${minutes(now - r.a.last)} minutes (it may have ended without a stop event).`),
    'The watchdog never stops an agent. Stopping one with TaskStop is the orchestrator\'s or the owner\'s choice, after checking on it.',
  ].join('\n');
  const agents = new Map(state.agents);
  for (const r of gone) agents.delete(r.id);
  return {
    state: { shownAt: now, agents },
    output: { hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext: text } },
    write: [], remove: gone.map((r) => r.id), shown: true, changed: true,
  };
}

/**
 * One event. Returns { state, output, write, remove, shown, changed }: write lists the agents whose state to save,
 * remove the agents whose state to delete, shown whether to save state.shownAt.
 */
export function step(state, input, { now = Date.now(), options = resolveOptions({}) } = {}) {
  const r = route(input);
  if (r === null) return nothing(state);
  if (r.who === 'sub') return subagent(state, input, r.id, now, options);
  if (r.stop !== undefined) return removed(state, r.stop);
  return status(state, input, now, options);
}
