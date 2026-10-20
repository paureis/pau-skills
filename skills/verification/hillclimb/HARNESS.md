# Hillclimb: the harness, the hypotheses and corrections

Names such as `DECIDE`, `<log>` and the step numbers, and `${CLAUDE_SKILL_DIR}`, mean what SKILL.md says (this folder).

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

## Step 6. Corrections

**Corrections.** If a row is wrong (a pasted measurement from the wrong run, the wrong tests value), append a new row
with the same `--id`, the right values and a note that starts with `corrects:`. The latest row for an attempt id
stands for that attempt everywhere: in the reference, the best number and the counts. If a kept change later turns
out to break behaviour, `git revert <its commit>`, append a correction for it (`--id <id> --decision revert
--tests fail --hypothesis <as before> --change <as before> --note "corrects: reverted in <sha>, <why>"`), then
measure and append a new baseline row with the same `--better` and a note `re-baseline after reverting attempt <id>`.
Later deltas are against that baseline.
