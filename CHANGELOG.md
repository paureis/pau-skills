# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

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
