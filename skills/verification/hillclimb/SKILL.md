---
name: hillclimb
description: "Improve one number of the project (run time, bundle size, memory, a score) in measured steps: one change per attempt, kept only when it beats the noise, each kept win committed. Use when the user says 'make this faster until', 'get the bundle under 200 KB', 'push the score up', 'optimize this metric'."
argument-hint: "[the metric, the target and the case, for example: wall time of the import on the 60k-row file, 50% faster, at least 8 attempts]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/hillclimb.md
---

# Hillclimb

The goal: $ARGUMENTS

Improve one number step by step, and prove every step. Each attempt is one change and one measurement, and the change
is kept only when the number moved past noise and the tests still pass. Everything else is reverted. A win read from
the code is not a win; only a measured number in the log is.

For a single wrong result or crash, use `bug-fix` if it is installed (without it: reproduce, find the cause, fix it,
prove it). For a one-off slowdown with a known cause, fix it once and vet the before and after numbers with the
checklist below. This skill is the loop for sustained improvement against a target.

If you started this skill on your own, without the user typing its name or asking for it, first say in one or two
lines what it will do and what it will cost, and wait for a yes. If the user asked for it, go ahead.

Bundled files:
- `${CLAUDE_SKILL_DIR}/BENCHMARK-CHECKLIST.md`: run it before any number is reported or acted on (the baseline,
  every keep, the final result).
- `${CLAUDE_SKILL_DIR}/decisions.mjs` (Node 20+, no dependencies): `append` adds a row to the decision log,
  `measure` runs a command N times and prints the measurement, `summary` prints the log as a table. Below, `DECIDE`
  stands for `node "${CLAUDE_SKILL_DIR}/decisions.mjs"`. Write the full command each time: a shell variable does
  not survive from one Bash call to the next.

Make a task list with one entry per step (Pin, Prepare, Harness, Baseline and sensitivity, Hypotheses, Loop, Report)
before you start. Without a task tool, keep the same list in a `notes.md` next to the decision log and tick it off
there.

## Rules that apply throughout

- **One change, one measurement, one decision.** Never stack two untested changes: two changes between measurements
  cannot be told apart.
- **The harness is frozen** once it is proven sensitive (step 4). It does not change during the loop. If you find it
  broken, stop, tell the user, fix it, and redo step 4 with a new baseline row whose note says why; numbers from the
  old harness are not compared with the new ones.
- **The stop predicate is fixed at the start** and written in the baseline row. Never relax it mid-run: not the
  target, not the minimum number of attempts, not the metric.
- **The tests pass at every keep.** A faster change that breaks a test is reverted.
- **The decision log is outside the repository's working tree,** so `git reset --hard`, `git checkout` and
  `git clean -fdx` cannot touch it (`decisions.mjs` refuses a path inside a git work tree). Rows are appended, never
  edited. A correction is a new row.

### The measurement format

Every number in the log is one line: `median=<number><unit> runs=<count> spread=<number><unit>`, for example
`median=1.23s runs=10 spread=0.04s`, `median=812KB runs=3 spread=0KB` or `median=0.734 runs=5 spread=0.012`.
- `median` is the median of the runs, `runs` how many runs it is of, and `spread` the largest value minus the
  smallest. The median and the spread use the same unit, or none.
- Extra `key=value` pairs may follow, such as `errors=0 work=60000` from a harness that counts them.
- Two numbers differ **beyond noise** when the gap between their medians is larger than the larger of the two
  spreads. `decisions.mjs` writes the delta that way: `-0.5s -25.0% better, beyond noise` or
  `+0.01s +0.8% within noise`.

The delta of every row is against the best kept so far: the best number among the latest baseline and the keeps
after it. A keep needs a measurement with at least 3 runs (more is better; see step 3), passing tests, and a delta
that says "better, beyond noise". The script refuses anything else, except a keep within noise whose note starts with
"simplification" (step 6) and the final check (step 8).

## Step 1. Pin the metric, the case and the stop predicate

Write down, from the user's request (ask with AskUserQuestion only for what is missing):
- **The metric**: what number, in what unit, and which way is better (`lower` for time, size or memory; `higher` for
  a throughput or a score).
- **The case**: a workload that reproduces what the user cares about. Read the code path it takes first, and name the
  dimensions that can move the result (data size, history, state, concurrency, cold or warm cache). If no case shows
  the problem, fix the case before climbing; climbing a case that does not show the problem improves nothing the
  user sees.
- **The stop predicate**: a target paired with a minimum number of attempts, for example "median at most half the
  baseline, and at least 8 attempts". The minimum keeps a lucky early win from ending the run before the cheap ideas
  are tried. Use the user's numbers when given; otherwise propose them and get a yes.
- **The budget**: the most attempts or time the user will spend (default: 20 attempts). Reaching it ends the run
  with the predicate not met; it does not change the predicate.

## Step 2. Prepare the repository and the log

1. `git status --short` prints nothing. A revert discards everything in the files an attempt touched, so a dirty tree
   puts the user's work at risk. If it is dirty, ask the user to commit or stash, or work in a separate worktree:
   `git worktree add ../<repo>-hillclimb -b hillclimb/<metric>`.

   Files the harness, the build or the tests write (`__pycache__/`, `target/`, `bin/` and `obj/`, a coverage
   report, a benchmark's output folder) would make the tree dirty after every run. If they are not ignored already,
   run the harness and the tests once now, and list each new path in `.git/info/exclude` (a local ignore file that is
   not committed), so `git status --short` prints nothing again. For Python you can also set
   `PYTHONDONTWRITEBYTECODE=1`.
2. If you are on the default branch, create a branch: `git switch -c hillclimb/<metric>`.
3. Pick the log path outside the working tree, for example a sibling folder: print it with
   `echo "$(cd .. && pwd)/<repo>-hillclimb-log/decision.tsv"` from the repository root (it survives a reboot; the
   system temp folder may not). Use that absolute path as `<log>` in every command below, because a relative path
   points somewhere else once a command runs from another folder. Tell the user the path now, and put it in the task
   list so it survives a context summary. `DECIDE append` creates the file and its folder on the first row.
4. Find the project's test command (the regression gate): the task runner's `test` target, `cargo test`,
   `go test ./...`, `pytest`, `mvn test`, `gradle test`, `dotnet test`, `npm test`, and so on. Run it now. It must
   pass before the first change; if it fails, stop and report, because a red gate cannot tell a broken change from a
   good one.

## Step 3. Build the harness

The harness is one repeatable command that runs the case and lets you read the metric. Use the project's own
benchmark tooling first. Look for:
- Rust: `benches/` and `[[bench]]` in `Cargo.toml`, run with `cargo bench` (criterion prints a median and an
  interval);
- Go: `func Benchmark` in `*_test.go`, run with `go test -run '^$' -bench <name> -count 10` (`benchstat` summarizes
  it if it is installed);
- Python: `pytest-benchmark` in the dependencies (`pytest --benchmark-only --benchmark-json=<file>`), or `asv`;
- JVM: JMH (`@Benchmark`, usually a `jmh` Gradle or Maven target);
- .NET: BenchmarkDotNet (`[Benchmark]`, run in Release);
- a `bench` or `benchmark` target in `package.json` scripts, a `Makefile`, `justfile`, `Taskfile.yml`, `tox.ini` or
  `noxfile.py`.

Without one, write a small harness script in the project's language that runs the case once, checks that the output
is correct (it exits non-zero when it is not), and prints a count of the work done. Then:
- **Time**: `DECIDE measure --runs 7 -- <harness command>`; it runs one warmup, then the given runs, and prints the
  measurement line. If `hyperfine` is installed, `hyperfine --runs 7 --export-json <file> '<command>'` works too:
  take its `median`, and `max` minus `min` as the spread.
- **Size, memory or a score**: make the harness print the number on its last line, with its unit
  (`812KB`, `0.734`), and run `DECIDE measure --runs 3 --value stdout -- <harness command>`. Size from `wc -c` or
  `du -k`; peak memory from `/usr/bin/time -v` (Linux, "Maximum resident set size") or `/usr/bin/time -l` (macOS).
- **A command that needs a shell** (a redirection, a pipe, `&&`): pass `--shell` and the whole command as one quoted
  argument after `--`, for example `DECIDE measure --runs 3 --value stdout --shell -- "wc -c < dist/app.js"`.
  `--shell` refuses more than one argument after `--`.
- **The project's tool**: write its median and its range (largest minus smallest) in the format. If it reports only a
  mean and a deviation, run the tool's single measurement through `DECIDE measure` instead of inventing a median.

Pick the run count: at least 5 for anything timed, 10 or more when one run takes under a second, and enough that the
spread is small next to the gain you hope for. A metric that comes out the same every time (a size) needs 3 runs to
show that it does. Pick it for the runs you hope to reach, not only for the baseline: if the goal is 10 times
faster, a 2-second run becomes a 0.2-second run, which wants 10 or more. Use the same command and run count for every
measurement in the run, except the longer re-measure of a close call (step 6). The count can rise only at a
re-baseline: measure the kept code (HEAD) with the new count and append a new baseline row with the same `--better`
and a note such as `re-baseline: runs 5 to 20, the spread was as large as the gains left`.

Then vet the harness with `${CLAUDE_SKILL_DIR}/BENCHMARK-CHECKLIST.md`, all of it: name the limiter (question 1), and
check that it is tuned, counts errors, and did the work (questions 2, 4 and 7). Fix what it finds before freezing.

**Freeze it.** If the harness belongs in the repository, commit it on its own and note the commit. If it is already
committed (with the code or on its own), freeze it at the current commit: note `git rev-parse --short HEAD`. If it
lives outside the tree, keep it next to the log and note `git hash-object <file>` for each harness file. Before every
measurement from here on, the harness is unchanged: `git diff --quiet <freeze commit> -- <harness files>` exits 0,
or the hashes match.

## Step 4. Baseline, then prove the harness sensitive

1. Run `uptime` and note the load. Measure the unchanged code, and log it with the predicate and the load in the
   note:
   ```bash
   DECIDE measure --runs 7 -- <harness command>
   DECIDE append <log> --decision baseline --tests pass --better lower \
     --measurement "<the line measure printed>" --hypothesis "baseline" \
     --change "harness: <command>, frozen at <commit or hashes>; code at <git rev-parse --short HEAD>" \
     --note "stop: <the predicate>; budget: <n> attempts; load <uptime's first figure> on <cores> cores"
   ```
   If the harness prints error and work counts, add them to the measurement line by hand (`median=... runs=...
   spread=... errors=0 work=40000`), from one run you read yourself; `measure` keeps only the time.
2. **Deliberate regression.** In the code the case runs (not the harness), make one change that must make the number
   clearly worse: call the hot function twice, add a sleep of about a third of the median on the measured path, add
   a large unused dependency to the bundle, break a part the score depends on. Measure with the same command, then
   log it:
   ```bash
   DECIDE append <log> --id sensitivity --decision revert --tests pass --measurement "<line>" \
     --hypothesis "a deliberate regression must make it worse" --change "<what you broke>"
   ```
   Use `--tests fail` if the regression broke a test; that is fine here. The delta it prints must say
   "worse, beyond noise". The id `sensitivity` keeps this row out of the attempt count.
3. Revert the regression (`git restore -- <files>`, or `git checkout -- <files>` on older git) and check that
   `git status --short` prints nothing.
4. If the regression did not move the number beyond noise, the harness does not measure the code you will change.
   Do not start the loop: fix the case, the workload size or the run count, and redo this step.

Optional, when the case is new: run two contrasting workloads (a small and a large input) and check that they
separate the way you expect, and have the harness print its error and work counts as extra pairs.

## Step 5. Plan the hypotheses

Profile the case once in a run you do not log (checklist question 1) and name the limiter. Every hypothesis names a
mechanism and a prediction ("the loop recounts the whole list for each word; one pass with a map removes the
quadratic part, expect at least 5 times faster"), not "try caching something". Check its ceiling with the Amdahl
arithmetic in the checklist: a change to a piece that takes 10% of the run can make it at most about 11% faster.

For time or memory, order the hypotheses by the performance mantras, cheapest first:
1. Do not do it. Stop work whose result nothing uses, rather than making it cheaper.
2. Do it, but do not do it again (cache or reuse the result).
3. Do it less.
4. Do it later.
5. Do it when they are not looking (in the background, off the path the user waits on).
6. Do it concurrently.
7. Do it cheaper.

For size, the same order applies (do not ship it, ship one copy, ship less, load it later). For a score, order by
expected gain over cost. Write the list in the task list.

## Step 6. The loop: one hypothesis per attempt

For each attempt:
1. Run `DECIDE summary <log>` and read it, so you do not retry a refuted idea or forget the best kept number.
2. Write the hypothesis and its prediction.
3. Make the one change yourself. If the gate in the next step fails because your code for the idea is wrong (a
   typo, a wrong pattern), fix that code and run the gate again; it is still the same one change, and the note says
   so. If the idea itself breaks behaviour, revert. (Optional: for a large change, hand it to a subagent with the
   Agent tool and `isolation: "worktree"`, review its diff, and bring it into your tree. Several independent
   hypotheses can be built in parallel worktrees, but measure them one at a time in the same tree: two benchmarks
   at once slow each other.)
4. Run the regression gate (the test command from step 2).
5. Check that the harness is unchanged and that `uptime` is close to the baseline's (within about 0.5 of it).
   If the load is higher, find what is running and wait for it, or stop it if it is yours. If it stays high,
   re-baseline under the same load: `git stash -u`, measure the kept code (HEAD), append a new baseline row with the
   same `--better` and a note `re-baseline: load <x>`, `git stash pop`. Then measure with the same command and run
   count. If the gap to the best kept number is less than twice the larger spread, measure again with twice the runs
   and use that line.
6. Decide, and log the row before you commit (`append` refuses a keep that is not one, so a refusal means revert):
   - **Keep** when the tests pass and the delta says "better, beyond noise". Run the checklist's questions 3, 4 and 7
     on the number: run the harness once and read its error and work counts, and check the gain against the Amdahl
     ceiling of the piece you changed. Then:
     ```bash
     DECIDE append <log> --decision keep --tests pass --measurement "<line>" --hypothesis "<why>" --change "<what>"
     git add <the files you changed>
     git commit -m "<change>: <metric> <old median> to <new median> (attempt <id>)"
     ```
     `append` prints the attempt id (the first attempt is 1); use it in the commit message. Stage only the files you
     changed, never `git add -A` or `git add .`. One commit per kept win.
   - **Keep as a simplification** when the number is within noise of the best kept number and the change removes
     code or complexity without changing behaviour, including behaviour the tests do not cover (a regex that splits
     "İstanbul" where the old loop did not is a change in behaviour). Check the edge cases the tests leave out
     (empty, very large, non-ASCII, error paths) by running both versions on them. If behaviour changes at all, it is
     a change that must win on the number. Append with `--note "simplification: <what got simpler>"`, then commit as
     above.
   - **Revert** everything else: no gain, a gain within noise, a worse number, failing tests, a change that does not
     build. Undo it with `git restore -- <files>` (or `git checkout -- <files>`), delete files it created, check that
     `git status --short` prints nothing, then append the row with `--decision revert`, the measurement if you have
     one, and a note on what you learned. A tweak that "might help" is not kept.
7. The attempt is done when the tree is clean and the row is in the log. Only then start the next one.

**Corrections.** If a row is wrong (a pasted measurement from the wrong run, the wrong tests value), append a new row
with the same `--id`, the right values and a note that starts with `corrects:`. The latest row for an attempt id
stands for that attempt everywhere: in the reference, the best number and the counts. If a kept change later turns
out to break behaviour, `git revert <its commit>`, append a correction for it (`--id <id> --decision revert
--tests fail --hypothesis <as before> --change <as before> --note "corrects: reverted in <sha>, <why>"`), then
measure and append a new baseline row with the same `--better` and a note `re-baseline after reverting attempt <id>`.
Later deltas are against that baseline.

After each keep, profile again: the limiter often moves, and the next hypothesis should target the new one.

## Step 7. Push past the first plateau, then stop

- After three reverts in a row, change tack: move to another mantra, combine two near misses as one new hypothesis,
  profile again, reread the code the case runs, or try something more radical before you conclude the hill is
  climbed.
- Correctness and simplicity outrank the number. Revert a win that breaks behaviour; keep a simplification that
  holds the number.
- **The noise floor.** When the spread is as large as the gains left (fixed costs such as startup or data setup now
  dominate the run), further attempts cannot be judged. Say so. The remedy is a different harness (a larger case,
  timing inside the process), which is a harness change: tell the user, and redo step 4 with a new baseline row.
  If the predicate is already met, stop instead.
- **Stop** when the log shows the predicate met: the target reached and at least the minimum number of attempts
  made. Check it against `DECIDE summary`, not memory: it prints the best kept number against the latest baseline,
  the attempt count (each attempt once, the sensitivity and final checks left out) and the first baseline's note with
  the predicate. Also stop when the budget is spent, or when every remaining idea has an Amdahl ceiling below the gap
  to the target, and say the predicate was not met. Do not stop while cheap untried hypotheses remain and the predicate is not met. If you are
  stuck, tell the user instead of spinning.

## Step 8. Check the result and report

1. Measure the final commit once more with the frozen harness, the same command and run count, and log it as the
   final check:
   ```bash
   DECIDE append <log> --id final --decision keep --tests pass --measurement "<line>" \
     --hypothesis "final check" --change "none: commit <sha> measured again"
   ```
   It must hold the best number within noise; if `append` refuses it as worse, the win did not hold, so say so in
   the report. If the run was long or the load changed, also check out the baseline commit (the "code at" commit in
   the baseline row) in a temporary worktree (`git worktree add <temp folder> <commit>`, outside the repository) and
   measure the two alternately, twice each, each turn a full `DECIDE measure` with the same run count; then remove the
   worktree (`git worktree remove <temp folder>`). Report all four lines.
2. Run the whole checklist on the final number. Run the full test suite once more.
3. Leave the kept commits on the branch in the order they landed. Do not push or open a pull request unless the user
   asks.
4. Report:

```
## Hillclimb: <metric>

Verdict:     predicate met | predicate not met (budget spent | ideas exhausted | stuck)
Metric:      <what, unit>, <lower|higher> is better; case: <workload>
Predicate:   <target> and at least <n> attempts
Baseline:    <measurement line>
Final:       <measurement line> (<percent> against baseline), limiter now: <limiter>
Sensitivity: <the regression> moved it <delta>
Attempts:    <n> (kept <k>, reverted <r>)
Kept:        <sha> <change> <delta>   (one line each)
Tests:       pass at baseline, at every keep, and at the end
Log:         <path to decision.tsv>
Next:        <the best idea you would try if pushed further>
```

Paste the output of `DECIDE summary <log>` under the report.
