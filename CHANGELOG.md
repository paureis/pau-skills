# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-11-27: Q44, the roster lock base check fails in CI when it finds no base

- Tests: when `ROSTER_LOCK_BASE` is set and gives no base commit (it does not resolve, the lock file or a valid `LOCK`
  is missing there, or git cannot run), `tests/geppetto-roster-lock-base.test.mjs` now fails and says to keep
  `fetch-depth: 0`. With the variable unset, it still passes with a note. CI is the only place that sets it. Q44.
- No plugin changed, so no version bump and no release.

## 2026-11-27: Q43, the roster lock checks a change against a base commit

- Tests: `tests/geppetto-roster-lock-base.test.mjs` reads `LOCK` at a base commit and fails when the roster hash
  changed and the number did not go up, so rewriting `LOCK` under the same number no longer passes. The base is
  `ROSTER_LOCK_BASE`, else the merge base with `origin/main`; with no base it passes and says so. CI fetches the full
  history and sets the base (HEAD^1 on a pull request, the previous main on a push). Q43.
- No plugin changed, so no version bump and no release.

## 2026-11-27: Q40, Q41 and Q42, follow-ups from batch 26

- `rule-to-hook`: HOOK-EVENTS.md has rows for `PostToolUseFailure`, `PostToolBatch`, `PreSkillShellCommand`,
  `StopFailure`, `TaskCompleted`, `PostCompact` and `ConfigChange`, each checked against the Claude Code 2.1.332
  binary, and says it is not the full list (34 events). The `PreCompact` row now says exit 2 blocks compaction, and
  `SessionStart` lists the `fork` source. Q40.
- Tests: `tests/geppetto-roster-lock.test.mjs` keeps the roster number with a hash of the roster files, so a roster
  change with no bump fails and the message gives the line to write. CLAUDE.md says to set it. Q41.
- `subagent-watchdog`: the read-only rule reads agent definitions the way Claude Code 2.1.332 loads them: subfolders
  (up to 8 levels) and links, an unclosed `tools: [Read, Grep` list, files with no or an empty description skipped,
  and a type read-only only when every definition of it is. `.git` folders and broken links are skipped. Q42.
- `guards` 0.12.2, `agent-orchestration` 0.15.2, `pau-skills-hooks` 0.9.2, `pau-skills` 0.27.2.

## 2026-11-27: Q34, Q36 and Q39, small follow-ups from earlier batches

- `rule-to-hook`: HOOK-EVENTS.md has a `UserPromptExpansion` row (a typed slash command or MCP prompt, matched on
  `command_name`; exit 2 blocks the expansion), and the exit code 0 note names it among the events whose plain stdout
  reaches the model. Q34.
- `file-size-guard`: the recipe for splitting a test file now says to add a helpers module only when two or more of
  the new files share the setup. `lazy-senior` REVIEW.md flags a new file that holds what an existing file could, and
  the roster builder carries the new-file rule from RULES.md (roster 8). Q36.
- `compact-snapshot`: after a compaction, the note shows this session's newest snapshot even when another session in
  the same project wrote a newer one. `subagent-watchdog`: a `.md` file with no frontmatter in an agents folder (a
  README, notes) no longer turns off the read-only rule, since Claude Code does not load it as an agent. Q39.
- New backlog items Q40, Q41 and Q42 for what these reviews found.
- `guards` 0.12.1, `planning` 0.13.1, `agent-orchestration` 0.15.1, `session-discipline` 0.18.1, `pau-skills-hooks`
  0.9.1, `pau-skills` 0.27.1.

## 2026-11-27: Q35, wizard for the steps only a person can do

- `wizard` (session-discipline, new, adapted from mattpocock/skills): when work is blocked on a step only a person can
  do (an API key, a secret, a dashboard, an app approval), the agent writes a JSON steps file and hands over one
  command. `wizard.mjs run` shows one step at a time and checks each (a file, an environment variable, a dotenv line,
  a URL's status, a command's exit); `status` lets the agent confirm afterwards. The person puts every value in place
  themselves, and the script never asks for, prints or logs one. Decision 37.
- `which-skill` routes a blocked setup step to `wizard`.
- `session-discipline` 0.18.0, `pau-skills` 0.27.0.

## 2026-11-26: compact-snapshot stops a third compaction

- `compact-snapshot` blocks a compaction once the session has compacted `maxCompactions` times (default 2, 0 for no
  limit), with a reason that says the session has already compacted twice. It still writes the snapshot first, since
  Claude Code compacts anyway when the request cannot go out uncompacted. The hand-off line at the limit says the next
  compaction will be blocked. Decision 38.
- `session-discipline` 0.17.0, `pau-skills-hooks` 0.9.0, `pau-skills` 0.26.0.

## 2026-11-26: Q38, watchdog fixes and a compaction count

- `subagent-watchdog` (Q38 items 1 to 4): an edit resets the counts wherever the file is, so a builder in another
  worktree is no longer asked if it is stuck. A project or user agent whose definition lists tools but none of Edit,
  MultiEdit or NotebookEdit is read-only and skips the no-edit rule; `readOnlyAgents` now adds to the defaults. A call
  in flight for two hours is dropped as lost, not counted as a wait. The main-session status shows a top repeat only
  when it repeated, under the header "running or just finished".
- `compact-snapshot` (Q38 item 5, decision 35) counts the session's compactions and, from the second (option
  `handoffAfter`, default 2, 0 off), tells the session to finish the step and hand off. Another session's snapshot is
  neither shown nor counted.
- `agent-orchestration` 0.15.0, `session-discipline` 0.16.0, `pau-skills-hooks` 0.8.0, `pau-skills` 0.25.0.

## 2026-11-26: Q37, reframe and sharpen from pstack

- `reframe` (planning, new, typed only) teaches the expert words for what you are building, and a new `sharpen`
  (planning, typed only) makes a task deeper, not bigger, then rewrites the prompt. Both come from pstack at 41e4009
  with the body word for word; only the description and the license and upstream lines are ours.
  `tests/pstack-verbatim.test.mjs` checks both bodies against committed copies of upstream. Decision 33.
- The old `sharpen` (restate, confirm in six lines, then work) is gone. `agent-friendly-audit` and `which-skill` now say
  the user can type `/sharpen`; its trigger list is removed and the model-invoked descriptions drop from 11,382 to
  10,986 characters.
- `planning` 0.13.0, `session-discipline` 0.15.1, `pau-skills` 0.24.0.

## 2026-11-26: eng-lead and reviewer at high effort

- geppetto roster 7 (agent-orchestration 0.14.1): `eng-lead` and `reviewer` run at `effort: high` instead of `xhigh`,
  like `builder`. `lean-subagent-dev`'s generous budget now sets `high` for the builder, the plan checker and the
  reviewer, and the table never sets `xhigh`. Every covenant marker under geppetto goes from roster 6 to 7, and the
  installed copies in `.claude/agents/` follow. Decision 36.
- `agent-orchestration` 0.14.1, `pau-skills` 0.23.1.

## 2026-11-25: Q33, context in fewer calls

- `friction-review` (session-discipline) prints four more navigation lines: files read in pieces (2 or more Read
  ranges of one project file in one transcript), new files made with Write inside the project, new files in commits
  over the days of the sessions read (without merges, renames and root commits), and the reads and searches before the
  first edit in each folder, with the median, the maximum and the edits with the most. A shell command that writes a
  file is not counted as a read; Windows paths are compared after resolving the roots; a failing git log leaves that
  line "not counted". KINDS.md says what to do with the numbers.
- `file-size-guard` (guards) says to split only along a real boundary (the one its recipe names, a responsibility, a
  layer, a public interface) and to leave one line in the old file that says where each part went; with no such
  boundary, to ask the user for a per-path limit instead of a file that exists only to stay under the limit. The data
  recipe never splits and is unchanged. The default limit is unchanged.
- `lazy-senior` (planning, hook and skill) adds one rule: a new file needs a reason, never size alone; extend the
  nearest existing file first, keep code that changes together in one place, and a split file says where its parts
  went. It is not a rule against new files. The hook's context is now 1,772 characters (caps raised to 1,650 and 1,800
  with the owner's yes).
- `session-discipline` 0.15.0, `guards` 0.12.0, `planning` 0.12.0, `pau-skills-hooks` 0.7.0, `pau-skills` 0.23.0.

## 2026-11-25: Q32, skill-usage counts typed starts right

- The `skill-usage` hook (session-discipline) records a typed skill from the `UserPromptExpansion` event, under the
  name Claude Code resolved, instead of reading the prompt and looking for a `SKILL.md` in four folders. A plugin
  skill typed without its prefix, a skill from another marketplace and a synced skill whose `SKILL.md` is not in
  those folders are now counted: `/humanizer` is logged as `anthropic-skills:humanizer`, and a plugin skill typed
  bare as `<plugin>:<name>`. A built-in, an MCP prompt and a `.claude/commands` file in the scope Claude Code names
  are not counted; a plugin's own command and a command in a folder the hook does not check are counted as typed
  (`hooks/README.md` lists them). The hook left `UserPromptSubmit`, so it no longer runs on every prompt. On a Claude
  Code without `UserPromptExpansion` no typed line is written. The tests replay hook input recorded from headless runs
  of Claude Code 2.1.332 and 2.1.302. `session-discipline` 0.14.1, `pau-skills-hooks` 0.6.1, `pau-skills` 0.22.1.

## 2026-11-24: Q30, small additions from Matt Pocock's newer skills

- From mattpocock/skills at abeeaf9 (MIT), a few lines each, in our own words. `bug-fix` lists nine ways to build an
  automated check that goes red on the bug and minimises the repro one element at a time. `tdd` names the tautological
  test and has you note what each test surface catches and misses. `to-issues` slices a wide refactor as expand and
  contract, sizes each issue to one fresh context window, uses the tracker's own blocking links and names the frontier.
  `to-prd` allows a snippet a prototype produced. `to-issues`, `to-prd` and `improve-codebase-architecture` read
  `GLOSSARY.md` as well as `CONTEXT.md`, and the `upstream:` links of `to-issues` and `to-prd` are pinned to
  `to-tickets` and `to-spec`.
- `grill-me` asks in rounds (every decision whose prerequisites are settled, worded so "yes" accepts the
  recommendation), may send a long fact search to the read-only Explore agent, and offers a questionnaire for whoever
  can answer what you cannot. `handoff` gains a Start now mode that starts the next session in the background
  (`claude --bg`), only when you ask for it and say yes to the command; it explains that the new session works in its
  own worktree.
- `instructions-audit` weighs context load against cognitive load when it proposes moving material behind a pointer,
  and docs/ADDING-A-SKILL.md names the same trade for typed-only skills. `lean-subagent-dev` says what a pull request
  body holds: a before and an after, the triage table, and whether merging is a one-way or a two-way door.
- The versions bumped for Q28 cover these changes. No hook changed.

## 2026-11-24: Q29, friction-review

- A new typed-only skill, `friction-review` (session-discipline). Type `/friction-review` to count the friction that
  repeats across this project's last 30 sessions (or a number you give, or one session by id): searches before the
  first edit, empty searches, repeated reads and commands, big tool results, failed calls by class, check commands
  that no session ran or that no CI, pre-commit or hook runs, and "no guardrail". It knows package.json, Make,
  pyproject, Cargo and Go. It proposes a change per candidate by severity and makes only the ones you pick, one commit
  each. The script reads only this repository's transcript folders, redacts secrets, emails, passwords in commands and
  home paths, and never prints a tool result or a message you typed. Adapted from mattpocock/skills `retro`, which
  reviews one session.

## 2026-11-24: Q28, some skills typed only again

- Seven skills now start only when you type them: `session-close`, `lean-subagent-dev`, `overnight-run`,
  `skill-eval`, `agent-friendly-audit`, `geppetto` and `launch-readiness` (`disable-model-invocation: true`,
  decision 32). Their descriptions are one short line each and cost no context; the model-invoked descriptions total
  11,395 characters of 14,000. A skill another skill starts stays model-invoked, so `session-close` still runs the
  short retrospective and the handoff, and now offers the full `retrospective` when it finds a correction or a broken
  rule. It no longer starts by itself at a context warning. The headless turns of `overnight-run` read a copy of its
  SKILL.md in the control folder. `rule-to-hook` and `engineering-principles` tell you to type
  `/agent-friendly-audit` and `/skill-eval`.
- The ask-first list drops from 14 skills to 9. `which-skill` has a "Skills you type" section, and its hook table
  moved to `HOOKS.md`. `scripts/new-skill.mjs --typed-only` scaffolds a typed-only skill, and
  `tests/typed-only-list.mjs` decides the list, checked against the frontmatter, the README, `which-skill` and every
  mention. Typed-only skills have no trigger request list.
- Versions for the whole batch (Q28 to Q31): session-discipline 0.14.0, verification 0.16.0, agent-orchestration
  0.14.0, guards 0.11.0, planning 0.11.0, the bundle 0.22.0. No hook changed. After the upload, check one typed-only
  skill in the terminal too: the claude.ai test covered the desktop app.

## 2026-11-24: Q27, Claude Ship and our skills

- `lean-subagent-dev` (agent-orchestration 0.13.1) and `safe-merge` (guards 0.10.1) know Claude Code's `/ship`: the
  user runs it on their own machine (an agent cannot start it), it may push fixes after the orchestrator's check and
  never merges. Before the merge the orchestrator reads what it pushed and reruns the checks at the new head, and
  `safe-merge` says to leave GitHub auto-merge off, since a fix `/ship` pushes could merge the PR. Code Review's
  `REVIEW.md` needed nothing: only the managed service (Team and Enterprise) reads it, and the local `/code-review`
  reads `CLAUDE.md`. The bundle goes to 0.21.1. No hook changed.

## 2026-11-23: Q21, a subagent watchdog

- A new hook, `subagent-watchdog` (agent-orchestration 0.13.0, `pau-skills-hooks` 0.6.0). Inside a subagent it adds a
  note when the same shell command runs a 3rd time with no edit in between, or when 40 tool calls pass with no edit,
  and asks on the 5th run or the 80th call. The ask refuses only that one call, and its reason tells a healthy agent
  to say so and go on. In the main session, when a subagent looks stuck (no tool call for 10 minutes), runs one
  command for 30 minutes or is at a note, it adds one line per running subagent, at most once every 5 minutes. It
  never stops an agent. Read-only agent types (reviewer, Explore, Plan, claude-code-guide, web-fetch, eng-lead) skip
  the no-edit rule and get repeat notes but no asks. An agent waiting on its own subagents is never flagged for it.
  The state is one small file per agent under the system temp folder, in a folder per user and session that must not
  be a link or writable by others. Thresholds and the read-only list are options; off with
  `{"hooks": {"subagent-watchdog": false}}`. Details in `hooks/agent-orchestration/subagent-watchdog.md`. `which-skill`
  (session-discipline 0.13.3) lists it with the other hooks.
- It runs before and after every tool call, in the main session and in every subagent: about 30 ms each time, so about
  60 ms per tool call.
- The bundle goes to 0.21.0. The entries of 2026-11-16 and 2026-11-18 moved to `docs/changelog/2026-W47.md`, since
  week 47 had ended. In the backlog, Q26 (hooks under Code Mode) is parked, Q27 (Claude Ship) is added, and
  `docs/backlog/decisions.md` is split, with decisions 1 to 21 in `docs/backlog/decisions-1-to-21.md`.

## Older entries

Each earlier ISO week is in its own file in docs/changelog/, named `<year>-W<week>.md`; a week too large for one file
goes on in `<year>-W<week>-2.md`.

- [2026-W47: 2026-11-16 to 2026-11-22](docs/changelog/2026-W47.md)
- [2026-W46: 2026-11-09 to 2026-11-15](docs/changelog/2026-W46.md)
- [2026-W45: 2026-11-02 to 2026-11-08](docs/changelog/2026-W45.md)
- [2026-W44: 2026-10-26 to 2026-11-01](docs/changelog/2026-W44.md)
- [2026-W43, second part: 2026-10-23 to 2026-10-25](docs/changelog/2026-W43-2.md)
- [2026-W43: 2026-10-19 to 2026-10-22](docs/changelog/2026-W43.md)
- [2026-W42: 2026-10-12 to 2026-10-18](docs/changelog/2026-W42.md)
- [2026-W41: 2026-10-05 to 2026-10-11](docs/changelog/2026-W41.md)
- [2026-W40: 2026-09-28 to 2026-10-04](docs/changelog/2026-W40.md)
