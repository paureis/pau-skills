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
| `readOnlyAgents` | `["reviewer", "Explore", "Plan", "claude-code-guide", "web-fetch", "eng-lead"]` | Agent types that are not expected to edit. They skip the no-edit rule, and get repeat notes but no repeat asks. A type such as `plugin:reviewer` matches by the part after its last `:`. A list adds to the default, without duplicates; entries that are not strings are dropped. |

A project's own agent type is read-only too when its definition says so: see [Read-only agent types](#read-only-agent-types).

A number that is not a whole number above 0 keeps its default. Fixed: 10 minutes for "looks stuck", 30 minutes for
a long call, 5 minutes between two status messages, 60 minutes before a silent agent is dropped, 120 minutes before
an agent with a call in flight that is not a wait is dropped, 200 commands kept per agent, commands cut to 120
characters in a message and 80 in the status.

## Read-only agent types

A type is read-only when it is in `readOnlyAgents`, or when its definition lists tools and none of Edit, MultiEdit or
NotebookEdit: a reader or critic with `tools: Read, Bash, Write` reads for many calls and writes one report at the
end, by design. At SubagentStart the watchdog reads `<project>/.claude/agents/*.md`, then
`~/.claude/agents/*.md` (the home folder is `PAU_SKILLS_HOME` when it is set, as for the config file), finds the file
whose frontmatter `name:` is the agent's type (the file name does not matter), and keeps the answer in the agent's
state. The project's definition wins when both folders have the name.

- `tools:` may be a comma list (`tools: Read, Bash, Write`), a flow list (`[Read, Grep]`) or a block list (one
  `- Read` per line). A `(...)` suffix, as in `Bash(git commit:*)`, is ignored. `*` counts as every tool.
- No `tools:` field means the agent gets every tool, so it is not read-only; `tools: null`, `tools: ~` and an empty
  `tools:` read the same. Nor is an agent limited only by `disallowedTools`.
- Not read: plugin agents, a folder set with `CLAUDE_CONFIG_DIR`, subfolders, links, a file over 64 KB, and the files
  past the first 200 `.md` files of a folder (by name). A `.md` file that is over 64 KB, cannot be read, or opens
  frontmatter that does not parse might be the type's own definition: when one comes before the match (the project
  folder first, each folder by name), the type is not read-only.
- A `.md` file with no frontmatter, such as a `README.md`, is skipped: its first line, after an optional byte order
  mark and with trailing white space dropped, is not `---` (an empty file has none). Probes of Claude Code 2.1.332
  (headless, empty HOME) found such files missing from the init event's agents list; a `---` line led by a byte order
  mark or with trailing spaces loads, and one after a blank line or after leading spaces does not. A skipped file
  still counts toward the 200.
- The no-edit note, the no-edit ask and the main-session no-edit flag name `readOnlyAgents` under
  `subagent-watchdog` in `.claude/pau-skills.json` as the way out for a type the watchdog cannot see is read-only.

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
line per subagent, oldest first, under the header "Subagents running or just finished": an agent that sent its final
message is listed until its SubagentStop arrives. Each line has the type, id, minutes running, tool calls, calls since
the last edit, the top repeat ("top repeat N runs of ..." only for a command run 2 or more times, else "no
repeats"), and the call in flight. At most once every 5 minutes. An agent is flagged when:

- it looks stuck: no tool call started or finished for 10 minutes and none in flight;
- a call has been in flight for 30 minutes ("running `npm test` for 31 minutes");
- a command reached the repeat note, or (for a type that is not read-only) the calls since the last edit reached the
  no-edit note; that flag names `readOnlyAgents`.

An agent waiting on its own subagents is never flagged stuck or long-running for it, and never dropped: its
subagents are watched on their own. Each Agent or Task call is tracked by its `tool_use_id` until the PostToolUse or
PostToolUseFailure with the same id (at most 32 per agent, the oldest dropped), so an agent that started several in
one message reads "waiting on 2 subagents for N minutes" while any of them runs. An Agent or Task call with no
`tool_use_id` reads "waiting on a subagent for N minutes" while it is the call in flight. A refused Agent call (a
PreToolUse with no PostToolUse) leaves its wait until the day-old prune. An agent with no call in flight, no wait
and no event for 60 minutes is dropped from the status with a last line saying so: it may have ended without a stop
event. An agent that dies in the middle of a call, as after a power cut, shows "running <command> for N minutes"
until its call has been in flight for 120 minutes, counted from the start of the call; then, unless it waits on a
subagent, it is dropped with a line that says "a call in flight for N minutes with no result". A TaskStop that ran in
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
[`subagent-watchdog-logic.mjs`](subagent-watchdog-logic.mjs), and the main-session status in
[`subagent-watchdog-status.mjs`](subagent-watchdog-status.mjs).
