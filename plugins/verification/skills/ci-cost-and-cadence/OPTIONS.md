# The options

Five ways to spend CI on the expensive suite (end-to-end, integration, anything that takes many minutes). The cheap
checks (typecheck, lint, unit tests) run on every push in all of them. Fill the table at the end with this project's
measured numbers; the notes say how to compute each cell.

Symbols for the cost models: `P` PRs per month, `p` pushes per PR, `p1` pushes after the first green full run, `S`
billed minutes of a full suite run, `Q` billed minutes of the cheap checks, `N` nights a month with new code, `R`
releases a month, `K` fixed minutes of scheduled jobs.

## 1. Full suite on every push

- **Cost**: `P x p x (S + Q) + R x S + K`. Grows with every review round.
- **Wait per push**: a full run.
- **What can reach staging or production broken**: only what the suite does not test.
- **Guarantee lost**: none.
- **Complexity**: lowest. The baseline every other option is compared with.

## 2. Full suite once, when the PR is marked ready (gatekeeper job)

Draft pushes run the cheap checks; marking the PR ready (`ready_for_review`) runs the suite. A gatekeeper job with the
required check's name runs always (`if: always()`) and succeeds only on positive proof that the suite ran and passed;
anything else (skipped, cancelled, empty output) fails it.

- **Cost**: `P x (p x Q + (1 + p1) x S) + R x S + K`. Every push after "ready" pays a full run unless the PR goes back
  to draft first.
- **Wait per push**: cheap checks while in draft; a full run after "ready".
- **What can reach staging broken**: the same as option 1, because the suite still guards every merge.
- **Guarantee lost**: none, provided the gatekeeper cannot go green without the suite.
- **Complexity**: medium. Event types, a gatekeeper with explicit result checks, draft discipline for agents.
- **The finding that decides it**: it pays off only if PRs really get one full run. Measure `p1`. If review rounds,
  doc fixes and reviewer findings arrive after the first green run, the saving shrinks to a fifth or less of the
  current cost. Check the history before trusting the projection.

## 3. Only touched or related tests per PR

Select the tests the PR changed, or map changed code to the tests that cover it.

- **Cost**: `P x p x (setup + selected tests + Q) + nightly or release full runs`. The setup (services, browser, build)
  is paid on every push even when few tests run, so this is often more expensive than people expect.
- **Wait per push**: setup plus the selected tests.
- **What can reach staging broken**: regressions in tests that were not selected (code that a changed shared helper
  breaks elsewhere, untouched tests that depend on changed data).
- **Guarantee lost**: a full run per merge.
- **Complexity**: high. Selection from changed code is hard to get right; a filter must still prove that the expected
  tests ran.

## 4. Nightly on the main branch, full suite on the release PR

PRs to the integration branch run the cheap checks only. The full suite runs at night on the integration branch when
code changed since the last really-tested tree, and always on the PR that releases to production. A recorded full
local run gates each merge. Detail in `NIGHTLY.md`.

- **Cost**: `P x p x Q + N x S + R x S + K + about 2 minutes per trigger for the decision job`. Does not grow with
  pushes per PR.
- **Wait per push**: the cheap checks only.
- **What can reach staging broken**: what the recorded local run did not see (operating system differences, the
  merged result with a branch that moved), for up to one night.
- **What can reach production broken**: nothing the suite tests, because the release PR runs it.
- **Guarantee lost**: "every merge passed the suite in CI" becomes "a recorded local run prevents it, the nightly
  detects it, nothing reaches production without a full run".
- **Complexity**: medium. Two workflows for the suite, a decision job, an alert, a local record with a merge gate, a
  push guard. A few hours to build and review.

## 5. Self-hosted runner

Run the existing workflows on a machine you own.

- **Cost**: hosted minutes drop to near zero for the jobs moved; the machine, its upkeep and its electricity do not.
  Check the provider's current pricing for self-hosted runners; platform fees for them have been announced and
  postponed before.
- **Wait per push**: depends on the machine and on how many jobs share it.
- **What can reach staging broken**: the same as the option it runs.
- **Guarantee lost**: a clean, ephemeral machine per run. On a private repository, anyone who can push a branch can run
  code on that machine, including through a compromised dependency installed during the job.
- **Complexity**: medium to high. The machine must be on and awake, isolated (a VM or container, not the developer's
  own session with live cloud credentials), and must not collide with local services, ports or databases the developer
  uses.

## Comparison table (fill with measured numbers)

| | Minutes per month (at the current and at the busiest recent rate) | Wait per push | What can reach staging broken, and for how long | What can reach production broken | Guarantee lost | Complexity |
|---|---|---|---|---|---|---|
| Today | | | | | | |
| 1. Every push | | | | | | |
| 2. Once at "ready" | | | | | | |
| 3. Touched tests | | | | | | |
| 4. Nightly + release PR | | | | | | |
| 5. Self-hosted | | | | | | |

Mark each figure measured or estimated. Under the table: the recommendation, the measured reason, the estimated
reason, and one sentence that names what the user gives up.

Worked example (anonymised, estimated): with about 75 PRs a month, five pushes each, a 21-minute suite and 2.5-minute
cheap checks, option 1 projected near 7,000 minutes, option 2 between 3,300 and 5,900 depending on discipline,
option 3 near 3,800 (setup on every push), and option 4 between 1,500 and 1,750 with the wait per push falling from
about 20 minutes to about 2.5.

## Cheap savings that fit any option

- `timeout-minutes` on every job: the default can be hours, and a hung job bills until it ends.
- Stop running the full suite on the push that a merge makes to the integration branch if the PR already ran it on the
  same tree; or stop running CI on that push entirely if the chosen option does not need it.
- `concurrency` with `cancel-in-progress` on PR workflows, so a new push stops the old run (it still bills what ran).
- Upload test reports only on failure or flakiness, with a short retention: that is storage, not minutes.
- Caches keyed on the lockfile and the tool version, saved from a branch every PR can read (usually the default
  branch).
