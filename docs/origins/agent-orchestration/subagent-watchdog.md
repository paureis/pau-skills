# Subagent watchdog hook, `hooks/agent-orchestration/subagent-watchdog.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** A subagent sometimes spends half an hour rerunning tests for a one-line change, loops, or stalls, and
nobody notices until it reports. A stalled agent makes no tool calls, so its own hooks never fire: only the main
session can see a stall. Decisions 22 and 23 set the limits: never cut off a healthy long run, stopping needs a yes,
and no skill is needed.

**What two headless prototypes showed.** Subagent hook events carry their own `agent_id` and the main session's
`session_id`. An "ask" in `claude -p` refuses one call, the reason reaches the agent, and it carries on. A refused call
has no PostToolUse. A failed command fires PostToolUseFailure. An agent stopped with TaskStop gets no SubagentStop, and
TaskStop's `task_id` is that agent's `agent_id`, so the hook removes the agent when it sees the TaskStop.

**What the plan check and the review changed.** One shared state file per session lost stops and resets between
parallel agents (9 and 7 of 48 in a measurement), so the state is one file per agent. The ask's reason tells a healthy
agent to say so and go on, since fixes made through the shell, mutation runs and poll loops reach an ask. The review
found that an agent waiting on several subagents read as stuck once the first returned, so each Agent call is tracked
by its `tool_use_id`, and that a loop of failing edits or commits was never told anything, so those calls may get a
note.

**Changes for this release.** New.
