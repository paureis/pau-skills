# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

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
- Versions: session-discipline 0.14.0, verification 0.16.0, agent-orchestration 0.14.0, guards 0.11.0, planning
  0.11.0, the bundle 0.22.0. No hook changed. After the upload, check one typed-only skill in the terminal too: the
  claude.ai test covered the desktop app.

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
