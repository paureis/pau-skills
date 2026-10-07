---
name: ci-cost-and-cadence
description: Decide how much CI to run and when, weighing CI minutes, money and waiting time against what each check has actually caught; ask, measure, lay out options with numbers, recommend, then build with safeguards. Use when GitHub Actions minutes or the CI bill are running out or growing, agents push many times per PR, developers wait 20 minutes per push, slow PR feedback, someone asks "do we need the full test suite on every push", "should E2E run nightly", "run tests once per PR", "move tests to a nightly run", or when setting up CI for a new project.
argument-hint: "[what prompted it, e.g. 'minutes run out by day 12']"
---

# CI cost and cadence

A method, not an answer. Every option trades something: money, waiting time, or a guarantee about what can reach a
shared environment broken. Your job is to make that trade visible with numbers from this repository, recommend one
option, and then build it so that no shortcut can turn a skipped check into a green one.

Context from the user: $ARGUMENTS

Reference files, read when you reach their step:
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/ci-cost-and-cadence/MEASURE.md`: where the minutes go, and what the suite has caught
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/ci-cost-and-cadence/OPTIONS.md`: the five options and the comparison table
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/ci-cost-and-cadence/NIGHTLY.md`: the nightly-with-safeguards design in detail
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/ci-cost-and-cadence/TRAPS.md`: platform traps, each with what to do
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/ci-cost-and-cadence/templates/`: workflow skeletons and pseudocode, starting points only
- `${CLAUDE_PLUGIN_ROOT}/skills/verification/ci-cost-and-cadence/measure-minutes.mjs`: estimates billed minutes by workflow and job

## 1. Ask first, but read before asking

Answer from the repository and the CI provider whatever they can answer (workflow files, branch protection, run
history, scripts). Ask the user only what they cannot, one question at a time, each with your recommended answer:

1. Monthly allowance, spending limit, and current usage. Who can read the official billing page.
2. How many pushes a typical PR gets, and who pushes: humans, coding agents, or both.
3. How long the full suite takes in CI and locally, and whether a full local run is practical on the machines in use.
4. Which checks branch protection requires, on which branches, and whether admins can bypass them.
5. How a release reaches production, and what must never reach it untested.
6. How much risk the shared staging environment can carry for a few hours, and whether anyone demos from it.
7. Whether anyone needs an alert that actually reaches a phone, and through what (an assigned issue, a heartbeat
   monitor, chat).

Do not propose anything until these are answered or explicitly left open.

## 2. Measure before designing

Follow `MEASURE.md`. Two numbers decide most of the design:
- **Where the minutes go**: by event, workflow, job and PR, counting cancelled and failed runs (they bill) and the
  per-job round-up to a whole minute. Project the month at the current rate.
- **What the expensive suite has caught**: classify every red run since a date into (a) real defects a local run
  would not have seen, (b) defects a full local run would have seen, (c) flaky tests or infrastructure, (d) mistakes in
  the workflow itself. If (a) is near zero and (c) plus (d) dominate, the suite on every push mostly buys waiting.

Label every figure as measured or estimated. The official billing figure often needs a token scope the CLI does not
have; say so instead of presenting an estimate as the bill.

## 3. Lay out the options, then recommend

Fill the comparison table in `OPTIONS.md` with this project's numbers: cost per month, wait per push, what can reach
staging and production broken, the guarantee lost, complexity. Then recommend one, with the measured reason first and
the estimated reason second, and state plainly what the user gives up. Get an explicit decision before building.

Two findings that usually matter:
- "Full suite once per PR" pays off only if PRs really get one full run. Review-round pushes after the first green
  run are what make it fail; count how many runs came after the first green one before trusting it.
- A nightly model is the only one whose cost does not grow with the number of pushes per PR. It trades the guarantee
  "every merge passed the suite in CI" for "a recorded local run prevents it, the nightly detects it, nothing reaches
  production without a full run". That is a real loss; say it in those words.

## 4. Build with safeguards

If the choice is the nightly model, `NIGHTLY.md` is the design and `templates/` the skeletons. For any option, read
`TRAPS.md` before writing a workflow: most of the traps produce a green check that ran nothing.

1. **Read-only investigation first**: current workflows, protection settings (read with the API, not from memory),
   run history. Verify each platform fact in `TRAPS.md` against the provider's current documentation.
2. **Write the design down and have it reviewed adversarially** by someone or some agent that did not write it, before
   building. Ask the reviewer what a skipped job, an empty green run and a second job with the same name would do.
3. **Cap CI runs while building** (for example three planned, six at most) and never push while a run is in progress:
   a cancelled run still bills.
4. **Plan the landing order** (protection change, merge, first run) as in `NIGHTLY.md`, so there is neither an
   unguarded window nor a PR that can never merge.
5. **After merging**, run the post-merge checklist in `NIGHTLY.md`: a forced first run, a "no changes" run, an alert
   test, a real red run on a throwaway branch, the first scheduled run, and a before/after measurement over a week.

Be honest about effort: the nightly model with its safeguards takes a few hours to build and review, plus a week to
confirm the savings. Until that week is measured, savings are a projection.

## When NOT to do this

- The full suite takes a few minutes: the machinery costs more than it saves.
- A public repository on free hosted runners: minutes are not the constraint; only waiting time is.
- A full local run is impractical (hardware, licensed services, platform-specific runners): without it, the nightly
  model has no gate before the shared branch.
- Regulated settings that require CI evidence on every change: keep the suite on every PR and work on its speed
  instead (sharding, caching, test selection on top of a full run).
