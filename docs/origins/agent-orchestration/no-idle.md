# No-idle hook, `hooks/agent-orchestration/no-idle.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** A subagent that ends its turn waiting for a monitor, a background task or a message is not resumed by
anything. The rule "never end your turn waiting; use a bounded foreground loop" was in every brief, until one brief
left it out and the builder sat idle for an hour. As a hook, it no longer depends on the orchestrator remembering it.

It adds the rule as start-up context at SubagentStart, which two headless runs on 2026-11-11 showed reaching launches
in the foreground, in the background, in a worktree and as a fork. The PreToolUse rewrite of the `Agent` prompt is
off by default, since auto mode in the desktop app refused a launch whose input a hook had changed (a headless
auto-mode run accepted it); `rewritePrompt` turns it back on outside auto mode. One lesson is written into the code: the hooks documentation says `updatedInput` may be
partial, but in practice Claude Code validated it as the complete tool input and rejected a prompt-only
`updatedInput` ("The required parameter `description` is missing"). With the option on, the hook returns the whole
input with only the prompt changed. It always exits 0 and never writes to stderr: a hook that failed closed would leave every session
without agents.

**Changes for this release.** Translated; the rule text can be replaced with `NO_IDLE_RULE`; `decide()` is exported
for tests.
