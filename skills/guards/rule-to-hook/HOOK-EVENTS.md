# Claude Code hook events: what each receives and how it can block or inform

A working summary for choosing an event. Hook contracts change between Claude Code releases, so before relying on a
field or an output shape, check it against the current reference: https://code.claude.com/docs/en/hooks. If the two
disagree, the reference wins; note the difference in your report.

## How a command hook talks to Claude Code

- **Input**: one JSON object on stdin. Every event carries `session_id`, `transcript_path` (a JSONL file of the
  conversation), `cwd`, and `hook_event_name`; most also carry `permission_mode`. Event-specific fields are listed
  below.
- **Environment**: `CLAUDE_PROJECT_DIR` is the project root (use it in `.claude/settings.json` commands so the hook is
  found from any subdirectory). In a plugin's `hooks/hooks.json`, `${CLAUDE_PLUGIN_ROOT}` is the plugin's install
  folder.
- **Exit code 0**: success. Stdout is parsed as JSON if it is JSON. For `UserPromptSubmit`, `UserPromptExpansion` and
  `SessionStart`, plain stdout is added to Claude's context; for `PreCompact` it is added to the compact instructions,
  and for `PostCompact` it is shown to the user; for other events, plain stdout only shows in the transcript view.
- **Exit code 2**: a blocking error. Stderr is fed back (to Claude or to the user, depending on the event, see the
  table) and the action is stopped where the event allows it. JSON on stdout is ignored with exit 2.
- **Any other exit code**: a non-blocking error. The action goes ahead and stderr is shown to the user. A guard that
  crashes therefore fails open by accident; make it fail open on purpose, with a clear code path.
- **JSON output fields common to all events**: `continue: false` stops Claude entirely (with `stopReason` shown to the
  user), `suppressOutput` hides stdout from the transcript, `systemMessage` shows a warning to the user.
- **Timeout**: 60 seconds by default, set per hook with `"timeout"` (seconds). Keep guards under a second; they run on
  every matching call.
- **Matchers**: for tool events, `matcher` is a regular expression on the tool name (`Bash`, `Write|Edit|MultiEdit`,
  `mcp__github__.*`). An empty matcher or `*` matches everything. Several hooks that match the same call run in
  parallel, and the most restrictive decision wins.

## The events

| Event | When it fires | Extra input fields | Can it block? How | Use it to enforce |
|---|---|---|---|---|
| `PreToolUse` | Before a tool call runs, after Claude has chosen its arguments | `tool_name`, `tool_input`, `tool_use_id` | Yes. Exit 2 (stderr goes to Claude), or JSON `permissionDecision` `deny` / `ask` / `allow` | "Never run X", "never write Y into Z", "never edit files under P" |
| `PermissionRequest` | When a permission dialog would be shown | `tool_name`, `tool_input` | Yes, it answers the dialog (allow or deny) | Auto-answering a permission prompt; rarely the right place for a rule |
| `PostToolUse` | After a tool call succeeded | `tool_name`, `tool_input`, `tool_response` | Not the call (it already ran). Exit 2 or JSON `{"decision":"block","reason"}` sends the reason to Claude so it fixes the result | "Every edited file must pass the formatter", "after writing a migration, run the checker" |
| `PostToolUseFailure` | After a tool call failed. Recorded with Claude Code 2.1.330, a failed command fires it; with 2.1.332, a `TaskStop` on a task that is gone does not | `tool_name` (the matcher is tested against it), `tool_input`, `tool_use_id`, `error`, `is_interrupt` (can be absent), `duration_ms` (can be absent; leaves out permission prompt and hook time) | Not the call (it already failed). Exit 2 shows stderr to Claude at once, or JSON `additionalContext` adds context. Exit 0 output is not shown | Reminders shown to Claude right after a failure, such as "after a failed test run, remind Claude to read the output before retrying". It only informs: a block belongs in `PreToolUse` |
| `PostToolBatch` | Once after every tool call in a batch has resolved, before the next model request (`PostToolUse` fires per call, and may run in parallel for parallel calls) | `tool_calls` (an array of `tool_name`, `tool_input`, `tool_use_id`, `tool_response`); no matcher | Not the calls (they already ran). Exit 2 stops the agentic loop (stderr to the user only). JSON `additionalContext` adds context once for the whole batch | "After a batch that edited files, run the formatter once"; one reminder per batch instead of one per call |
| `UserPromptSubmit` | When the user submits a prompt, before Claude sees it | `prompt` | Yes. Exit 2 erases the prompt (stderr to the user only), or JSON `{"decision":"block","reason"}`. Plain stdout or `additionalContext` adds context | Injecting a reminder when a prompt mentions a topic; refusing prompts that contain secrets |
| `UserPromptExpansion` | When a typed slash command resolves and expands into a prompt: a skill, a custom command or a built-in prompt command, and also an MCP prompt. Recorded with Claude Code 2.1.332 and 2.1.302, it fires after `UserPromptSubmit`; for a `context: fork` skill it fires first | `expansion_type` (`slash_command`, or `mcp_prompt`), `command_name` (the resolved name; the matcher is tested against it), `command_args`, `command_source` (can be absent; seen: `userSettings`, `projectSettings`, `plugin`, `bundled`, `builtin`), `prompt` | Yes. Exit 2 blocks the expansion (stderr to the user only), or JSON `{"decision":"block","reason"}`. Plain stdout or `additionalContext` adds context | Refusing a command in a given state, such as a deploy skill on a dirty tree; injecting a reminder whenever a given skill or command runs |
| `PreSkillShellCommand` | Before a skill's inline shell command runs. The facts here come from the 2.1.332 binary and were not probed live; whether `PreToolUse` also fires for the same command is not settled | `tool_name` (`Bash` or `PowerShell`; the matcher is tested against it), `tool_input` (`command`, with its arguments filled in), `tool_use_id` (names no tool call in the transcript), `command_name` (the skill or command whose text holds it), `command_source` (can be absent), `invoked_by` (`user`, `claude`, `other`) | Yes. Exit 2 keeps the command from running (stderr to Claude and the user). JSON `permissionDecision` `deny`, `ask` or `defer` also keeps it from running, and `allow` adds nothing. An `updatedInput` is never applied: any value keeps the command from running | The same command rules as `PreToolUse` ("never run X"), for the shell lines inside skills and custom commands |
| `Stop` | When the main agent is about to end its turn | `stop_hook_active` | Yes. Exit 2 or JSON `{"decision":"block","reason"}` sends Claude back to work with the reason | "Do not say done until the tests ran", "never end with uncommitted changes". Check `stop_hook_active` and let it stop the second time, or it can loop |
| `StopFailure` | Instead of `Stop`, when an API error (a rate limit, an auth failure and others) ended the turn | `error` (the matcher is tested against it: `authentication_failed`, `oauth_org_not_allowed`, `account_on_hold`, `verification_required`, `billing_error`, `rate_limit`, `overloaded`, `invalid_request`, `model_not_found`, `server_error`, `unknown`, `max_output_tokens`, `cloud_credential_error`), `error_details` (can be absent), `last_assistant_message` (can be absent) | No. Its output and exit codes are ignored | Logging or alerting on a turn that ended early; not enforcement |
| `SubagentStop` | When a subagent is about to finish | `stop_hook_active` | Same as `Stop`, for the subagent | Rules for delegated work |
| `TaskCompleted` | When a task is being marked as completed. The facts here come from the 2.1.332 binary and were not probed live | `task_id`, `task_subject`, `task_description` (can be absent), `teammate_name` (can be absent), `team_name` (can be absent, deprecated); no matcher | Yes. Exit 2 prevents the task completion and shows stderr to Claude | "A task is not done until its tests ran" |
| `SubagentStart` | When a subagent starts | agent details | No; JSON `additionalContext` informs the subagent | Passing a rule into every subagent |
| `SessionStart` | New session, resume, fork, `/clear`, or after compaction | `source` (`startup`, `resume`, `clear`, `compact`, `fork`) | No. Plain stdout or `additionalContext` adds context | Loading state the agent keeps forgetting (branch, open tasks) |
| `PreCompact` | Before the context is compacted | `trigger` (`manual`, `auto`), `custom_instructions` | Yes. Exit 2 blocks compaction. Exit 0 stdout is added to the compact instructions; any other exit code shows stderr to the user and compaction goes on | Writing a snapshot that `SessionStart` with source `compact` reads back |
| `PostCompact` | After the context is compacted. Recorded with Claude Code 2.1.332, it fires before the new `compact_boundary` line is in the transcript, for manual and auto compaction alike | `trigger` (`manual`, `auto`; the matcher is tested against it), `compact_summary` | No. Exit 0 stdout is shown to the user only, so it cannot tell Claude anything; exit 2 is like any other error, stderr to the user only | Checking that the summary kept what a rule needs and warning the user; to tell Claude, use `SessionStart` with source `compact` |
| `SessionEnd` | When the session ends | `reason` | No | Cleanup, logging |
| `ConfigChange` | When a configuration file changes during a session | `source` (`user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills`; the matcher is tested against it), `file_path` (can be absent) | Yes. Exit 2 blocks the change from being applied to the session, except a `policy_settings` change, which is applied anyway | Refusing a mid-session settings change that removes a guard or widens permissions |
| `Notification` | When Claude Code sends a notification (waiting for input, permission needed) | `message` | No | Alerts; not enforcement |

The table is not the full list of hook events: Claude Code 2.1.332 has 34, and the ones left out are ones a rule rarely needs.

## Common `tool_input` shapes

| Tool | Fields worth checking |
|---|---|
| `Bash` | `command`, `description`, `timeout`, `run_in_background` |
| `Write` | `file_path`, `content` |
| `Edit` | `file_path`, `old_string`, `new_string`, `replace_all` |
| `MultiEdit` | `file_path`, `edits` (array of `old_string` / `new_string`) |
| `NotebookEdit` | `notebook_path`, `new_source` |
| `Read`, `Glob`, `Grep` | `file_path`, `pattern`, `path` |
| MCP tools (`mcp__<server>__<tool>`) | whatever that tool's schema defines |

Some installs also expose a `PowerShell` tool with `command`; a shell guard that should cover Windows users matches
`Bash|PowerShell` and must not assume POSIX syntax for the second.

## PreToolUse: exit 2 or JSON?

| You want | Output |
|---|---|
| Block, and let Claude read why and try another way | exit 2, reason on stderr (simplest; what the templates do) |
| Block, with the reason also structured | exit 0 and `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` |
| Let the user decide each time (false positives are likely, or the action is sometimes right) | `permissionDecision: "ask"` with the reason |
| Rewrite the arguments before the call runs | `updatedInput` together with a decision (check the reference: the field has changed between releases) |
| Approve without a prompt | `permissionDecision: "allow"`. Avoid this in a guard: it skips the user's permission rules for that call |

## Where hooks are registered

- `~/.claude/settings.json`: every project on this machine, only for you.
- `.claude/settings.json`: this project, committed, for everyone who clones it. The usual place for a rule-to-hook guard.
- `.claude/settings.local.json`: this project, only for you, not committed.
- A plugin's `hooks/hooks.json`: everyone who installs the plugin. Paths use `${CLAUDE_PLUGIN_ROOT}`.

Claude Code reads hook configuration when a session starts. After changing it, open `/hooks` to review the change or
start a new session, then test the hook live once.
