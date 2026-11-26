// Subagent watchdog, the main-session status: which subagents are flagged, the line for each, and which are dropped.
// Pure, like subagent-watchdog-logic.mjs, whose step() calls status() for a main-session UserPromptSubmit or
// PreToolUse. The two modules import each other; each uses the other's bindings only inside functions, never while
// it loads, so either can be imported first. The rules are in the logic file's header comment.
import { LIMITS, READ_ONLY_HINT, WAIT_TOOLS, isReadOnly, minutes, normalizeCommand, nothing } from './subagent-watchdog-logic.mjs';

const oneLine = (s, n) => normalizeCommand(s).slice(0, n);

/** The flags of one agent at `now`, in words, and whether it is dropped (lost: for a call in flight 2 hours, not a wait). */
export function judge(a, now, o) {
  const flags = [];
  const idle = now - a.last;
  const waiting = a.waits.length > 0 || (a.flight !== null && WAIT_TOOLS.has(a.flight.tool));
  if (a.flight === null && !waiting && idle >= LIMITS.stuck) flags.push(`looks stuck: no tool call for ${minutes(idle)} minutes`);
  if (a.flight !== null && !waiting && now - a.flight.at >= LIMITS.long) flags.push(`one call has run for ${minutes(now - a.flight.at)} minutes`);
  if (a.top && a.top.n >= o.repeatNote) flags.push(`the same command ran ${a.top.n} times with no edit in between`);
  if (!a.ro && !isReadOnly(a.type, o.readOnlyAgents) && a.sinceEdit >= o.noEditNote) flags.push(`${a.sinceEdit} tool calls with no edit (${READ_ONLY_HINT})`);
  const lost = a.flight !== null && !waiting && now - a.flight.at >= LIMITS.lost;
  return { flags, drop: lost || (a.flight === null && !waiting && idle >= LIMITS.drop), lost, waiting };
}

function line(id, a, now, { flags, waiting }) {
  const bits = [`${oneLine(a.type, LIMITS.type) || '(no type)'} ${id}: ${minutes(now - a.start)} minutes, ${a.calls} tool calls, ${a.sinceEdit} since the last edit`];
  bits.push(a.top && a.top.n >= 2 ? `top repeat ${a.top.n} runs of \`${oneLine(a.top.cmd, LIMITS.shown)}\`` : 'no repeats');
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

export function status(state, input, now, o) {
  if (state.agents.size === 0) return nothing(state);
  const rows = [...state.agents]
    .sort(([x, a], [y, b]) => a.start - b.start || (x < y ? -1 : x > y ? 1 : 0))
    .map(([id, a]) => ({ id, a, ...judge(a, now, o) }));
  if (!rows.some((r) => r.flags.length) || now - state.shownAt < LIMITS.throttle) return nothing(state);
  const kept = rows.filter((r) => !r.drop);
  const gone = rows.filter((r) => r.drop);
  const text = [
    `[subagent-watchdog] Subagents running or just finished, at least one flagged (shown at most once every 5 minutes):`,
    ...kept.map((r) => line(r.id, r.a, now, r)),
    ...gone.map((r) => `- dropped ${oneLine(r.a.type, LIMITS.type) || '(no type)'} ${r.id}: ${r.lost ? `a call in flight for ${minutes(now - r.a.flight.at)} minutes with no result` :`no event for ${minutes(now - r.a.last)} minutes`} (it may have ended without a stop event).`),
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
