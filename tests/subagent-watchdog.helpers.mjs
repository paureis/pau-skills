// Shared helpers for the subagent-watchdog tests: a small simulator that feeds events to step() with a clock.
import { step, emptyState, resolveOptions } from '../hooks/agent-orchestration/subagent-watchdog-logic.mjs';

export const SID = 'session-1';
export const T0 = 1700000000000;
export const MIN = 60 * 1000;

/** A simulator over step(): send(input, dt) moves the clock by dt milliseconds, then runs the event. */
export function sim({ project, options = {}, now = T0, state = emptyState() } = {}) {
  const o = resolveOptions(options);
  const s = { state, now, project };
  s.send = (input, dt = 1000) => {
    s.now += dt;
    const r = step(s.state, input, { now: s.now, options: o, where: { project, cwd: input.cwd } });
    s.state = r.state;
    return r;
  };
  s.agent = (id = 'agent-1') => s.state.agents.get(id);
  return s;
}

/** A subagent event (agent-1, a builder) and a main-session event. */
export const sub = (event, extra = {}) => ({ session_id: SID, hook_event_name: event, agent_id: 'agent-1', agent_type: 'builder', ...extra });
export const main = (event, extra = {}) => ({ session_id: SID, hook_event_name: event, ...extra });

/** '-' for no output, 'ask' or 'note'. */
export const kind = (r) => (r.output === null ? '-' : r.output.hookSpecificOutput.permissionDecision === 'ask' ? 'ask' : 'note');
export const textOf = (r) => r.output.hookSpecificOutput.additionalContext ?? r.output.hookSpecificOutput.permissionDecisionReason;

/** One tool call that ran: PreToolUse, then PostToolUse. Returns the PreToolUse result. */
export function call(s, tool, toolInput, extra = {}) {
  const e = { tool_name: tool, tool_input: toolInput, cwd: s.project, ...extra };
  const r = s.send(sub('PreToolUse', e));
  s.send(sub('PostToolUse', e));
  return r;
}
export const bash = (s, command, extra) => call(s, 'Bash', { command }, extra);
/** The kinds of `times` runs of one command. */
export const runs = (s, cmd, times, extra) => Array.from({ length: times }, () => kind(bash(s, cmd, extra)));
/** `len` kinds, '-' except at the 1-based positions given. */
export const expected = (len, at) => Array.from({ length: len }, (_, i) => at[i + 1] || '-');
/** The kinds of `times` Read calls on different files in the simulator's project. */
export const reads = (s, times, extra) =>
  Array.from({ length: times }, (_, i) => kind(call(s, 'Read', { file_path: `${s.project}/f${i}.js` }, extra)));

/** An agent's state with the given fields changed. */
export const agentEntry = (over = {}) => ({
  type: 'builder', start: T0, last: T0, calls: 0, sinceEdit: 0, edit: 0, runs: {}, top: null, flight: null, ...over,
});
