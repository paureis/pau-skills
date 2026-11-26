# subagent-watchdog

A hook in the `agent-orchestration` plugin (and in `pau-skills` and `pau-skills-hooks`) that watches subagents while
they run. A subagent sometimes reruns the same tests for half an hour on a one-line change, loops, or stalls, and
nobody notices until it reports. The watchdog tells the agent, then asks, and shows the main session which agents
look stuck. It never stops an agent: stopping one with TaskStop is the orchestrator's or the owner's choice.

On by default. Turn it off with `{"hooks": {"subagent-watchdog": false}}` in `.claude/pau-skills.json` (the user
file or the project file), or for one session with `PAU_SKILLS_DISABLE=subagent-watchdog`.

## Options

Under `"subagent-watchdog"` in `.claude/pau-skills.json`:

| Option | Default | Meaning |
|---|---|---|
| `repeatNote` | `3` | A note on this run of the same shell command with no edit in between. |
| `repeatAsk` | `5` | An ask on this run, and on every multiple of it after (10, 15, ...). |
| `noEditNote` | `40` | One note on the first tool call at or past this many calls since the last edit. |
| `noEditAsk` | `80` | An ask on the first call at or past this many calls since the last edit, then at or past each multiple of it (160, 240, ...). |
| `readOnlyAgents` | `["reviewer", "Explore", "Plan", "claude-code-guide", "web-fetch", "eng-lead"]` | Agent types that are not expected to edit. They skip the no-edit rule, and get repeat notes but no repeat asks. A type such as `plugin:reviewer` matches by the part after its last `:`. A list replaces the default; entries that are not strings are dropped. |

A number that is not a whole number above 0 keeps its default. Fixed: 10 minutes for "looks stuck", 30 minutes for
a long call, 5 minutes between two status messages, 60 minutes before a silent agent is dropped, 200 commands kept
per agent, commands cut to 120 characters in a message and 80 in the status.

## Inside a subagent

- **A repeat** is the same shell command (Bash or PowerShell), with every run of white space read as one space, run
  again with no edit in between. Case, quotes and every other character make another command.
- **An edit** is Edit, Write, MultiEdit or NotebookEdit on any file, wherever it is (the project, a sibling worktree,
  the scratchpad or another temp folder), any file type, Markdown included; or a shell command that runs
  `git commit`, also inside `bash -c`. It counts when the call ran (PostToolUse): a refused edit, or one that failed
  (PostToolUseFailure), is no edit. An empty path or one over 4,096 characters is not an edit. Edits made through
  the shell, such as `sed -i`, do not count.
- **The note** is context added to the agent's tool call; it blocks nothing. It gives the count and the command, and
  says to change something or report what you have and what blocks you, and to go on if the run is healthy.
- **The ask** is a permission prompt for that one call. Interactive, the owner is asked: allowing lets the agent go
  on, denying refuses only this one call. Headless (`claude -p`), the call is refused and the agent reads the
  reason. The reason names the agent type and id and the count, and tells the agent: if it is not making progress,
  stop and report what it has and what blocks it; if it is (a poll, a fix made through the shell, a mutation run),
  say so in one line and go on.
- An edit, a `git commit`, SubagentHandback and SendMessage never get an ask, but may get a note: a loop of failing
  edits, or the same failing `git commit` run again and again, still gets the note. The no-edit note and ask come
  once per stretch and level, and start again after an edit.

## In the main session

On your message and on the main session's tool calls, when at least one subagent is flagged, the watchdog adds one
line per running subagent, oldest first: type, id, minutes running, tool calls, calls since the last edit, the top
repeat, and the call in flight. At most once every 5 minutes. An agent is flagged when:

- it looks stuck: no tool call started or finished for 10 minutes and none in flight;
- a call has been in flight for 30 minutes ("running `npm test` for 31 minutes");
- a command reached the repeat note, or (for a type that is not read-only) the calls since the last edit reached the
  no-edit note.

An agent waiting on its own subagents is never flagged stuck or long-running for it, and never dropped: its
subagents are watched on their own. Each Agent or Task call is tracked by its `tool_use_id` until the PostToolUse or
PostToolUseFailure with the same id (at most 32 per agent, the oldest dropped), so an agent that started several in
one message reads "waiting on 2 subagents for N minutes" while any of them runs. An Agent or Task call with no
`tool_use_id` reads "waiting on a subagent for N minutes" while it is the call in flight. A refused Agent call (a
PreToolUse with no PostToolUse) leaves its wait until the day-old prune. An agent that dies in the middle of a call
shows "running <command> for N minutes" until the day-old prune. An agent with no call in flight, no wait and no
event for 60 minutes is dropped from the status with a last line saying so: it may have ended without a stop event. A TaskStop that ran in
the main session removes the agent it names, because an agent stopped with TaskStop gets no SubagentStop.

## The state

One file per agent: `<temp folder>/pau-skills-watchdog-<uid>/<session_id>/<agent_id>.json`, and a file `shown` with
the time of the last status. `<uid>` is your user id, so users who share a temp folder each get their own; where the
system has no user ids (Windows) the folder is `pau-skills-watchdog`. The temp folder is the system's (`TMPDIR` on Linux and macOS, `TMP` or `TEMP` on Windows).
Both ids must be 1 to 128 letters, digits, `_` or `-`; any other event is ignored.

- The folders are made with mode 0700, and only when a state file is first written. Before every read, write or
  prune, both must be real folders (not links), owned by you and not writable by group or others (checked where the
  system has user ids). Otherwise the hook does nothing.
- A write goes to a temp file next to the state file (mode 0600), which is then renamed over it, so a reader sees
  the whole old file or the whole new one. A file that does not parse reads as empty and is replaced.
- Each agent writes only its own file, so parallel agents never undo each other's counts. Two parallel tool calls of
  one agent can lose an update; that can move a note or an ask by a call either way (a lost edit reset can bring
  one early), and only for parallel calls of one agent.
- The agent's file is removed at SubagentStop and at a TaskStop. At SubagentStart, session folders whose newest file
  is over a day old are removed (only when they hold nothing but files), and so are the session's own `.json`, `.tmp`
  and `shown` files over a day old. Links are never followed.

The hook prints at most one line of JSON, nothing on stderr, and exits 0 on every input. It uses no network and
starts no processes. The script is [`subagent-watchdog.mjs`](subagent-watchdog.mjs); the decisions are in
[`subagent-watchdog-logic.mjs`](subagent-watchdog-logic.mjs).
