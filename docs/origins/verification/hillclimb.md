# hillclimb and `decisions.mjs` (Adapted from [pstack hillclimb playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/hillclimb.md))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/poteto-mode/playbooks/hillclimb.md`, with the perf mantras from `playbooks/perf-issue.md`
and the checklist from `skills/benchmark-checklist/SKILL.md` and `skills/principle-explain-the-number/SKILL.md`.
`SKILL.md` shares about 2% of its word 6-grams with them and `BENCHMARK-CHECKLIST.md` about 24% (19% from
`benchmark-checklist`, 5% from `explain-the-number`), measured before the review round. The structure is shared: the
steps of the loop, the mantra order and the checklist questions. `decisions.mjs` is mine.

**Problem.** An agent asked to make something faster reads the code, makes several changes at once, runs it once and
reports a percentage. Or it stops at the first lucky win, keeps "might help" tweaks, and leaves no record of what was
tried.

**What this version changes.**
- The agent makes each change itself. Upstream's subagent with a configured model and parallel worktrees become an
  optional extra (the Agent tool with `isolation: "worktree"`, measured one at a time).
- The harness is proven sensitive by a required deliberate regression that must read "worse, beyond noise", then
  reverted. Upstream's contrasting workloads and printed error and work counts are optional.
- One measurement format (median, run count, spread as max minus min) and one noise rule (a gap larger than the larger
  spread).
- The log lives outside the working tree; upstream used a gitignored file, which `git clean -fdx` removes. It is
  append only, a correction is a new row that stands for its attempt everywhere, and the stop predicate is written in
  the baseline row.
- `decisions.mjs` is new: `append` refuses a keep without a measurement, a run count and a spread, a keep that is worse
  or within noise of the best kept number (unless it is a behaviour-preserving simplification), a baseline with
  failing tests, and a log inside a git work tree; `measure` repeats any command and prints the format at full
  precision; `summary` prints the table; a `final` row records the closing check.
- Harness detection for any ecosystem (`cargo bench`, `go test -bench`, `pytest-benchmark` or `asv`, JMH,
  BenchmarkDotNet, a bench target in the task runner), with a fallback for size, memory and score metrics.
- The mantras in order only, without perf-issue.md's "when an earlier mantra meets the target, stop".
- Added: a clean tree and a branch first, a regression gate on every attempt, the noise-floor rule, a fixed run count
  chosen for the runs you hope to reach, and a final check that measures the baseline commit and the final commit
  alternately.
- Dropped: opening a pull request and the links to Cursor-specific principle skills. The checklist gains profilers
  per ecosystem, a warning about tracing-profiler inflation, and Amdahl's 1/(1-p) form.

**Why.** The discipline upstream describes (one change, one measurement, keep or revert, no win from reading code) is
what matters, and as prose an agent bends it. The script makes the log the gate every keep passes through. The review
round found that a correction was judged against itself and that "simplification" keeps could drift without limit;
both are refused now.

**Later changes (2026-10-19).** `decisions.mjs` writes a single quote in front of any `decision.tsv` cell a
spreadsheet would read as a formula (the delta always starts with `+` or `-`), reads it back without the quote so old
logs still read, and refuses a value that would not read back as typed. The rule matches `overnight-run`'s `log.mjs`.
