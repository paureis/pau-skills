# agent-orchestration

Skills: `methodology` (the method document, two adoption prompts and templates), `codebase-oracle`,
`parallel-worktrees` (with `worktrees.mjs`). Hook: no-idle (turn it off with `"hooks": { "no-idle": false }`, see
[hooks/README.md](../../hooks/README.md)).

## No-idle hook

Every agent launched with the `Agent` tool gets this paragraph appended to its prompt (PreToolUse), and every
subagent gets it again as start-up context (SubagentStart):

> [no-idle] Rule: an agent that ends its turn waiting is not resumed by anything. You may start background processes,
> but never end your turn waiting for a monitor, a task or a message. To wait, use a bounded loop in the foreground,
> ten minutes at most per call, that prints the last observed state when it expires. If something does not finish in
> time, deliver your report anyway and say what was left running and what was left undone.

Each copy ends with `(via: prompt)` or `(via: start)`, so you can see which path reached the agent. The hook never
approves or denies a launch, always exits 0, and stays silent on input it does not understand.

### Configuration

Set `NO_IDLE_RULE` to replace the text, for example in the `env` block of your `settings.json`:

```json
{ "env": { "NO_IDLE_RULE": "[no-idle] Never end your turn waiting; poll in a bounded loop of at most five minutes." } }
```

To turn the hook off, disable the plugin.

### Known interaction

The PreToolUse path returns the complete tool input with only `prompt` changed, because Claude Code validates
`updatedInput` as a complete input. If another hook also rewrites `Agent` launches, hooks run in parallel and the last
one to resolve wins.
