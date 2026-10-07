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
- **Exit code 0**: success. Stdout is parsed as JSON if it is JSON. For `UserPromptSubmit` and `SessionStart`, plain
  stdout is added to Claude's context; for other events, plain stdout only shows in the transcript view.
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
| `UserPromptSubmit` | When the user submits a prompt, before Claude sees it | `prompt` | Yes. Exit 2 erases the prompt (stderr to the user only), or JSON `{"decision":"block","reason"}`. Plain stdout or `additionalContext` adds context | Injecting a reminder when a prompt mentions a topic; refusing prompts that contain secrets |
| `Stop` | When the main agent is about to end its turn | `stop_hook_active` | Yes. Exit 2 or JSON `{"decision":"block","reason"}` sends Claude back to work with the reason | "Do not say done until the tests ran", "never end with uncommitted changes". Check `stop_hook_active` and let it stop the second time, or it can loop |
| `SubagentStop` | When a subagent is about to finish | `stop_hook_active` | Same as `Stop`, for the subagent | Rules for delegated work |
| `SubagentStart` | When a subagent starts | agent details | No; JSON `additionalContext` informs the subagent | Passing a rule into every subagent |
| `SessionStart` | New session, resume, `/clear`, or after compaction | `source` (`startup`, `resume`, `clear`, `compact`) | No. Plain stdout or `additionalContext` adds context | Loading state the agent keeps forgetting (branch, open tasks) |
| `PreCompact` | Before the context is compacted | `trigger` (`manual`, `auto`), `custom_instructions` | No, use it to save state | Writing a snapshot that `SessionStart` with source `compact` reads back |
| `SessionEnd` | When the session ends | `reason` | No | Cleanup, logging |
| `Notification` | When Claude Code sends a notification (waiting for input, permission needed) | `message` | No | Alerts; not enforcement |

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
