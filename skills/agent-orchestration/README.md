# agent-orchestration

Skills: `methodology` (the method document, two adoption prompts and templates), `codebase-oracle` (with
`TIERS.md` and the explorer and explainer briefs),
`parallel-worktrees` (with `worktrees.mjs`), `lean-subagent-dev` (with a brief template, `TRIAGE.md`,
`review-scope.mjs` and `review-scope-rules.mjs`, identical copies of the ones in `review-triage`), `arena` (with `arena.mjs` and the candidate
and judge briefs), `overnight-run` (with `log.mjs`, `LOOP.md`, `AUDIT.md`,
`PROTECTION.md`, `CONTRACT.md` and `WAKE.md`), `geppetto` (with `COVENANT.md`, `check-agents.mjs` and its modules
`check-agents-yaml.mjs` and `check-agents-checks.mjs`, and the five agents under `roster/`). Hook: no-idle (turn it off with `"hooks": { "no-idle": false }`, see
[hooks/README.md](../../hooks/README.md)).

## lean-subagent-dev configuration

The usage budget comes from the `LEAN_SUBAGENT_BUDGET` environment variable (`tight`, `normal` or `generous`), else
`delegation.budget` in `.claude/review-rules.json`, else `normal`. The variable wins because the budget belongs to the
person more than to the project; set it once in the `env` block of your user `settings.json`:

```json
{ "env": { "LEAN_SUBAGENT_BUDGET": "tight" } }
```

| Budget | Delegate | Subagent model | Subagent effort | Review |
|---|---|---|---|---|
| tight | changes of 5+ files | the session's; a smaller one for mechanical work only on your yes, never for risky paths | builder `medium` | the orchestrator's own checks |
| normal | any change in behaviour or tests, and changes of 3+ files | the session's | builder and plan checker `high` | checks plus a read of every risky file |
| generous | any change in behaviour or tests, and changes of 2+ files | the session's | builder `high`, plan checker and reviewer `xhigh` | plus a reviewer subagent on risky files |

The rest of `.claude/review-rules.json` (must-fix list, risky paths, checks, and `delegation.minFiles` and
`delegation.log`) is described in [the verification README](../verification/README.md#review-triage-configuration).

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

## geppetto: the roster

Install copies `roster/*.md` into the project's `.claude/agents/`, where it is committed so the agents work in cloud
sessions and on every computer, and adds `.claude/worktrees/` to `.gitignore`. `eng-lead` plans, and after a yes
starts the builders and reviewers; it then returns one fix-round message per builder, and the main session sends
them and merges. Audit with `node check-agents.mjs --project <root> [--user <dir>] [--dir <folder>] [--json]`; it
exits 1 on errors. A missing covenant is an error in the project and a warning for personal agents in the user
scope. The overlap warning fires at a word-set score of 0.5.
