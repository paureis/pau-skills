# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

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
