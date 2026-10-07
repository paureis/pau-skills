---
name: flaky-test-hunt
description: Find out why a test or CI job fails only sometimes, instead of labelling it "flaky" and moving on. Captures the evidence, reproduces the failure by repetition with a measured failure rate (isolated, with its file, full suite, shuffled, parallel), classifies the cause against a taxonomy, fixes the root cause, and proves the fix with enough clean runs to mean something. Works in any language or test runner. Use when the user says "this test is flaky", "fails intermittently", "passes locally but fails in CI", "random test failure", "fails one run in ten", "CI is red again for no reason", "can we just retry it", "quarantine this test", or "why does this test sometimes fail".
argument-hint: "<test id, failing CI job or run link, and anything known about how often it fails>"
---

# Flaky test hunt

"Flaky" describes a symptom, not a cause. A test that fails some of the time is reporting a real nondeterminism:
in the test, in its environment, or in the product. This skill finds which one, fixes it, and proves the fix with
numbers rather than with one green run.

Context from the user: $ARGUMENTS

Reference files, read when you reach their phase:
- `${CLAUDE_PLUGIN_ROOT}/skills/flaky-test-hunt/COMMANDS.md`: per-ecosystem commands to isolate, repeat, shuffle and parallelize
- `${CLAUDE_PLUGIN_ROOT}/skills/flaky-test-hunt/TAXONOMY.md`: the causes, each with symptoms, how to confirm, right and wrong fix
- `${CLAUDE_PLUGIN_ROOT}/skills/flaky-test-hunt/repeat.mjs`: runs any command N times and reports the failure rate,
  a 95% interval and the distinct failure signatures

## Rules that apply throughout

- **Do not "fix" by retrying, waiting longer, or hiding the test.** Adding retries (`jest.retryTimes`, pytest
  `--reruns`, Surefire `rerunFailingTestsCount`, a CI retry step), raising a timeout, adding or lengthening a sleep,
  skipping, or quarantining are not fixes. Each one makes the signal quieter while the cause stays, and the cause is
  sometimes a real product bug that users will hit. You may propose one of these as a temporary measure, clearly
  labelled as such, only with the user's explicit approval, and only alongside a ticket for the real fix.
- **Do not call anything "flaky" in the report without a category from `TAXONOMY.md` and the evidence for it.** If
  you could not find the cause, say "not reproduced" or "cause unknown" and list what you tried and the counts.
- **Do not change the assertion to make it pass** (loosening equality, widening a tolerance, deleting the check)
  unless the analysis shows the assertion itself was wrong, and say so explicitly.
- **Numbers, not impressions.** "Ran it a few times and it passed" is not evidence. Every claim about frequency
  comes from a counted run: failures / runs, with the mode it ran in.
- **Change one thing at a time** between measured batches, so a change in the rate can be attributed.

## Phase 1. Capture the evidence

Before running anything, collect what already exists. Read it from the repository and CI; ask the user only what
those cannot answer.

- [ ] The exact test id (file, class, name, parameters) and the full failure output of at least one failing run:
      assertion message, stack trace, and the lines before it. Save it; later phases compare against it.
- [ ] How often: count failures of this test or job over recent CI history (for GitHub Actions, `gh run list
      --workflow <file> --limit 100 --json conclusion,headSha,createdAt` and `gh run view <id> --log-failed`). A rough
      historical rate tells you how many local runs you will need to see it.
- [ ] Where: which runners, OS images, architectures, language versions, shard or worker numbers, and time of day.
      A failure that only appears on one shard, after midnight UTC, or on the macOS runner is already a strong clue.
- [ ] What changed: when it started failing, and the commits, dependency bumps, CI image changes and test additions
      around that date. `git log --since` on the test file, the code it covers and the test config.
- [ ] Whether the failure output is the same every time. Two different messages are often two different problems.
- [ ] The test runner and how CI invokes it (the actual command in the workflow, with its flags, env and parallelism).

Done when you can state the failing test, one or more saved failure outputs, the historical frequency (or "unknown"),
the environments it fails in, and the CI command.

## Phase 2. Reproduce by repetition, with a measured rate

Detect the project's own runner first (lockfiles, `package.json` scripts, `pyproject.toml`, `go.mod`, `Cargo.toml`,
build files, the CI workflow) and use the commands in `COMMANDS.md` for it. Then run the ladder below, recording
`failures / runs` for each rung. Use `repeat.mjs` to do the counting, so the numbers and the failure signatures are
not tallied by hand:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/flaky-test-hunt/repeat.mjs" --runs 50 --timeout 120 --json flake-isolated.json -- pytest "tests/test_x.py::test_y" -p no:randomly
```

It sets `REPEAT_RUN` in each run's environment, groups failures by a normalized signature of their last lines, and
exits 1 if any run failed. Add `--parallel K` to run copies at once, `--until-fail` to stop at the first failure, and
`--shell` for npm/npx on Windows, pipes or `&&`.

| Rung | What runs | What a failure here suggests |
|---|---|---|
| 1. Isolated | the single test, N times, one process at a time | the cause is inside the test or the code it calls: time, randomness, async waits, races, network |
| 2. With its file | the test's file or class, N times | another test in the same file leaks state into it |
| 3. Whole suite | the full suite in CI order, fewer times (it is slower) | cross-file pollution, shared resources, resource exhaustion |
| 4. Random order | suite shuffled with a recorded seed, several seeds | order dependence; a failing seed reproduces it on demand |
| 5. Parallel | the suite or file with the CI's worker count, or more | shared ports, files, databases, globals across workers |

Pick N from the historical rate: to have a good chance (about 95%) of seeing a failure that happens with probability
p, you need about 3/p runs. A 10% flake needs about 30 runs; a 1% flake needs about 300, which usually means running
the isolated test in a loop rather than the suite.

If it does not reproduce locally, make the local run look like CI before raising N: same command and flags, same
worker count, `CI=true`, same timezone and locale (`TZ=UTC`, `LANG=C.UTF-8`), fewer CPUs (`taskset -c 0` on Linux,
`docker run --cpus=1`), background load, a clean checkout and cache. If it still does not reproduce, run the counting
in CI itself (a manual workflow that runs `repeat.mjs` on the same runner image).

Done when you have a table of rungs with `failures / runs` each, at least one rung where it fails, and the failing
seed if order matters. If no rung fails after the CI-like attempts, stop and report "not reproduced" with the table.

## Phase 3. Classify the cause

Open `TAXONOMY.md` and match the evidence against the categories: order dependence and shared state, time and date
boundaries, unseeded randomness, concurrency and races, async waits and sleeps, network and external services,
resource exhaustion (ports, files, memory, handles), pollution of globals and environment variables, floating point,
unordered collections, environment differences, and real product bugs that only appear under certain timing.

The rung where it first failed narrows the list. The failure signatures from `repeat.mjs` tell you whether there is
one cause or several; treat each distinct signature as its own hunt.

Then **confirm** the category with the experiment `TAXONOMY.md` gives for it. The strongest confirmation turns the
intermittent failure into a deterministic one: force the bad order, freeze the clock at the boundary, fix the seed
that fails, inject a delay at the suspected race point, block the network. A test that now fails 20/20 under the
forced condition and 0/20 without it has a confirmed cause. Keep that forcing setup; it often becomes the regression
test.

Done when one category is named, with the confirming experiment and its counts. "Probably a race" without a forced
reproduction is a hypothesis, not a classification; say so if that is where you stopped.

## Phase 4. Fix the root cause and prove it

Apply the right fix for the category from `TAXONOMY.md`. If the cause is in the product (a real race, a missing
await in application code, a date bug), fix the product and tell the user plainly that the test was right.

Then prove it, in this order:

1. The forced reproduction from Phase 3 now passes, or is kept as a regression test that fails without the fix
   (revert the fix once to watch it fail, then restore it).
2. Re-run the rung that reproduced it, in the same mode, until the clean count is large enough to mean something.
3. Run the full suite once to check the fix broke nothing else.

How many clean runs are enough: if the failure rate before the fix was p, then 0 failures in n runs makes a remaining
rate of p or more unlikely at about 95% confidence when n is about 3/p. This is the rule of three: with zero
events in n trials, the upper 95% bound on the rate is roughly 3/n. Examples:

| Measured rate before | Clean runs needed (about 95%) |
|---|---|
| 20% | 15 |
| 10% | 30 |
| 5% | 60 |
| 2% | 150 |
| 1% | 300 |

If the "before" rate came from only a few failures, its interval is wide; use its lower end (printed by `repeat.mjs`)
to pick n, which asks for more runs and is the honest choice. Twenty clean runs after a 5% flake proves almost
nothing: a 5% flake passes 20 times in a row about a third of the time.

Done when the report can say "before: X/N in mode M; after: 0/N' in the same mode", with N' at least about 3/p, and
the full suite green.

## Phase 5. Report

Produce this, filled in:

```
## Flaky test hunt: <test id>

Symptom:        <failure message, one line> (saved output: <path or excerpt>)
History:        <failures / runs in CI over <period>, or "unknown">; environments: <where it failed>
Reproduction:
  | Rung | Command (short) | Failures / runs | 95% interval |
  | ...  | ...             | ...             | ...          |
  Failing seed / condition: <seed, order, TZ, worker count, or "none">
Category:       <TAXONOMY.md category>
Evidence:       <the confirming experiment and its counts, e.g. "forced order A then B: 20/20 fail; B alone: 0/20">
Root cause:     <file:line and one or two sentences on the mechanism>
Fix:            <what changed and why it removes the cause; product or test>
Proof:          before <X/N> -> after <0/N'> in <mode>; regression test <name> fails without the fix: yes/no
Full suite:     <pass/fail, command>
Not done:       <other signatures seen, related tests with the same pattern, anything left for the user>
```

If the cause was not found, the report says "Cause: not found" and keeps the reproduction table, the categories ruled
out with the experiment that ruled each out, and what to try next. It does not say "flaky" as a conclusion.

## When to stop and ask

- The only fix you can find is a retry, a longer timeout, a skip or a quarantine: present the evidence and ask.
- The cause is in a third-party service or in CI infrastructure the user controls but you cannot change.
- Reproducing needs more runs than are reasonable locally (a 0.1% flake needs thousands): propose running the
  counter in CI and estimate its cost first.
