# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-11-06: Q20, verify-before-done without false alarms

- `verify-before-done` (verification 0.14.1, `pau-skills-hooks` 0.4.1) counts only edits inside the project, by the
  path as written or its real path, so a check followed by an edit to a scratchpad, `/tmp`, `~/.claude` or an artifact
  page no longer sends the agent back. Package-manager flags before the script (`npm --prefix web test`,
  `pnpm -C dir test`, `yarn --cwd dir test` and the like) and a Monitor call's command count as checks. A check inside
  a subagent still does not count, and a JSON edit in the project still needs a check (decision 22).
- This repository's `.claude/pau-skills.json` names its own checks (`npm run scrub`, the marketplace check and
  `claude plugin validate`) as `testCommands`.
- Decision 22 also settles the direction of Q21, a subagent watchdog. The bundle goes to 0.18.1.

## 2026-11-05: Q19, descriptions in printable ASCII only

- Rule 1 of `tests/description-rules.test.mjs` now flags every character of a description outside the space to the
  tilde (U+0020 to U+007E), not only quote marks. It closes the two gaps the Q18 review found: a fullwidth question
  mark inside a quoted phrase on a confirm-list skill, and quote ornaments. All 38 descriptions pass it, and each gap
  is proven with `mutate.sh` on a real description (decision 21).
- No skill changed, so no version changes.
- Q19 is done (pull request 67). The backlog is empty until the owner adds an item.

## 2026-11-04: Q18, tests for the description rules checked by hand

- `tests/description-rules.test.mjs` checks four rules on every description that the Q17 builder checked by hand: no
  quote mark but the ASCII apostrophe and double quote, no backtick, exactly one "Use ..." opener, and on a
  confirm-list skill no question mark in or right after a quoted phrase. Each rule is proven with `mutate.sh` on a real
  description.
- The confirm list moves to `tests/confirm-list.mjs`, which `tests/confirm-step.test.mjs` and the new test import.
- No skill changed, so no version changes.
- Q18 is done (pull request 65). The backlog is empty until the owner answers its decisions page, which recommends
  that rule 1 become "printable ASCII only". The done entries of 2026-10-20 to 2026-10-25 moved to
  `docs/backlog/done-2026-10-20-to-25.md`, since `done.md` would have passed 20,000 bytes.

## 2026-11-04: Q17, descriptions that start their skill

- `skill-eval` (verification 0.14.0): `triggers` takes `--max-turns` (1 to 3, default 1). summary.json records
  `maxTurns` and the turn of each start, the report shows the hits by turn when a run has more than one turn, and
  `--baseline` notes a different max turns. `evals/triggers/two-turn/requests/` holds the baseline's 41 "looked
  first" misses, checked by `tests/trigger-lists-two-turn.test.mjs`.
- The two-turn rerun of those 41 misses (4.49 US dollars) started no skill in turn 2: the one-turn limit was not what
  cost them. Its summary is in `evals/triggers/two-turn/summary/`, and `evals/triggers/baseline.md` says what it showed.
- Ten descriptions reworded so they say plainly what work is theirs, every request-1 phrase kept: `arena`,
  `codebase-oracle`, `lean-subagent-dev`, `overnight-run`, `parallel-worktrees` (agent-orchestration 0.11.2),
  `sharpen`, `to-prd` (planning 0.8.4), `retrospective` (session-discipline 0.13.1), `bug-fix` and `evaluator`
  (verification 0.14.0). All descriptions together go from 13,101 to 13,592 characters. The full round after it (34.67 US
  dollars, in `evals/triggers/after-q17/`) had no wrong start, every near miss right, and 186 hits of 228, up from 175.
- The entries of 2026-10-26 to 2026-10-30 moved to `docs/changelog/2026-W44.md`, since week 44 had ended.
- The bundle goes to 0.18.0.
- The owner kept every recommendation after Q17 (decision 20). Q18 adds tests for the description rules the Q17
  builder checked by hand; `docs/backlog/q18.md` holds the plan, and `docs/backlog/kickoff.md` the message that starts
  it. The next trigger round compares with `evals/triggers/after-q17`.

## Older entries

Each earlier ISO week is in its own file in docs/changelog/, named `<year>-W<week>.md`; a week too large for one file
goes on in `<year>-W<week>-2.md`.

- [2026-W44: 2026-10-26 to 2026-11-01](docs/changelog/2026-W44.md)
- [2026-W43, second part: 2026-10-23 to 2026-10-25](docs/changelog/2026-W43-2.md)
- [2026-W43: 2026-10-19 to 2026-10-22](docs/changelog/2026-W43.md)
- [2026-W42: 2026-10-12 to 2026-10-18](docs/changelog/2026-W42.md)
- [2026-W41: 2026-10-05 to 2026-10-11](docs/changelog/2026-W41.md)
- [2026-W40: 2026-09-28 to 2026-10-04](docs/changelog/2026-W40.md)
