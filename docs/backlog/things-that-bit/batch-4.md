# Things that bit the fourth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the fourth batch (M5, M8, M9, M10, M11, P1.2 with P1.3):
- The plan checks found a real problem in every brief again: `git patch-id --stable` ignores indentation (an
  indentation change that alters Python behaviour kept its id), the upstream paths named for M11 held none of the
  quoted phrases, a characterization test would be thrown away by `tdd`'s red-green loop, and the hook mapping the
  P1.3 brief proposed was wrong. The P1.3 plan check also counted the misses (one in eleven pull requests) and the
  owner chose a checklist line over a script.
- The reviewers found a must-fix or serious finding in every item: the M9 restore step erased the user's uncommitted
  edits, the evaluator gave a patch id for a dirty tree, the bump-listing command missed untracked files and renames,
  and the suppression hook skipped whole projects under a folder named `build/`.
- The cold runs again found what reviewers missed, and they ran as headless `claude -p` sessions with an empty HOME:
  the retrospective audit cannot see short CLAUDE.md bullets, `flaky-test-hunt` did not start for "CI failed, can we
  just retry it?" when the failure looked deterministic, and its agents diffed against a stale local main.
- Headless children inherit the session's environment (`CLAUDECODE`, the session id, attribution trailers in their
  commits); unset the `CLAUDE*` variables in the child when isolation matters.
- In a Python fixture, `mutate.sh` can leave stale `.pyc` files when a break and its restore land in the same second;
  set `PYTHONDONTWRITEBYTECODE=1`.
