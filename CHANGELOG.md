# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

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

## Older entries

Each earlier ISO week is in its own file in docs/changelog/, named `<year>-W<week>.md`; a week too large for one file
goes on in `<year>-W<week>-2.md`.

- [2026-W44: 2026-10-26 to 2026-11-01](docs/changelog/2026-W44.md)
- [2026-W43, second part: 2026-10-23 to 2026-10-25](docs/changelog/2026-W43-2.md)
- [2026-W43: 2026-10-19 to 2026-10-22](docs/changelog/2026-W43.md)
- [2026-W42: 2026-10-12 to 2026-10-18](docs/changelog/2026-W42.md)
- [2026-W41: 2026-10-05 to 2026-10-11](docs/changelog/2026-W41.md)
- [2026-W40: 2026-09-28 to 2026-10-04](docs/changelog/2026-W40.md)
