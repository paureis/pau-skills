# The nightly model with safeguards

One option among five (see `OPTIONS.md`), described in detail because it has the most moving parts and the most ways to
produce a green check that tested nothing. Names below are placeholders: `integration` is the branch PRs merge into
(often `develop` or the default branch), `production` the branch releases land on (often `main`), and "Full suite" the
name of the check that branch protection requires on `production`.

## What it promises, and what it gives up

- Every PR push gets a verdict from the cheap checks in a few minutes.
- No PR merges into `integration` through the project's merge command without a recorded full local run on exactly that
  code, or on code that differs from it only in documentation.
- The full suite runs on `integration` on every night that code changed since the last really-tested tree, and a red
  run reaches someone's phone.
- Nothing reaches `production` without a real, green full run in CI on the release PR's head, and no job can publish
  the required check's name without having run the suite.

What it gives up: "every merge passed the suite in CI". A defect the local run did not see (an operating system
difference, the merged result with a branch that moved on) can sit on `integration` and staging until the nightly run
detects it. The local record is a guard against forgetting, not against fraud.

## The pieces

### 1. Cheap checks on every PR push (`templates/pr-checks.yml`)

- Trigger: `pull_request` to `integration` and `production`. No `paths` filter.
- One job, always runs, with `timeout-minutes`. Its name is a required check on `integration`.
- Consider stopping CI on `push` to `integration`: the PR already ran the cheap checks on its head, and the nightly run
  covers the merged result.

### 2. The full suite for the release PR (`templates/release-suite.yml`)

- Its own workflow file with exactly one trigger: `pull_request` to `production`.
- Exactly one job, whose `name:` is the literal required check name: no expression in the name, no job-level `if:`, no
  `needs:`, no `continue-on-error`. That way no skipped job and no other workflow can publish that name.
- The same steps as the nightly suite. Duplicate them rather than sharing a reusable workflow (a called workflow's
  check is named `<caller job> / <called job>` and no longer matches the required name), and add a test that reads both
  files and asserts the step lists are identical.

### 3. The nightly workflow (`templates/nightly.yml`)

- Triggers: `schedule` (on the default branch) and `workflow_dispatch` with two boolean inputs: `force` (run regardless)
  and `test_alert` (exercise the alert without running the suite).
- A cheap **decision job** with minimal permissions (`actions: read` to list runs and jobs, `checks: read` to read
  annotations). It decides, in this order, failing closed (any error or missing datum means "run"):
  1. `test_alert`: do not run the suite; run the alert job as if red.
  2. `force`: run.
  3. **Cap**: if a full suite run on `integration` concluded within the last N hours (for example 12), do not run. A
     run that concluded `failure`, `cancelled` or `timed_out` counts, and selects a distinct mode ("cap after red") that
     sends no healthy heartbeat and closes nothing; a `success` selects "no changes".
  4. **Reference**: the most recent run of this workflow on `integration` whose suite job concluded `success` and
     published the tested-tree marker. A green run without the marker is not a reference. Search a bounded number of
     runs; no reference means run.
  5. **Compare trees**: `git diff --name-only --no-renames <reference tree> <current tree>`. Identical, or documentation
     only (one shared list), means "no changes"; anything else means run. Tree against tree is immune to force pushes and
     history shape; a tree object missing from the checkout is an error, so run.
  Pseudocode: `templates/decide-nightly.md`.
- The **suite job** has a different, literal name from the release check (for example "Nightly full suite"), depends
  on the decision job, and is skipped as a whole job when the decision says no. Never skip its steps instead.
- The suite's last step, reached only when everything before it passed, publishes the **tested-tree marker**: an
  annotation (or job summary line) with `git rev-parse HEAD^{tree}`.
- **Concurrency**: a fixed group with `cancel-in-progress: false`. A running nightly is not cancelled; a second waits;
  a third replaces the second in the queue (only one pending run per group), which is fine because it sees the same or
  newer code.
- Cron at an odd minute (the start of the hour is the busiest), chosen so that a run arriving hours late still lands
  outside working hours. Measure how late this repository's scheduled runs actually arrive.
- Save dependency and browser caches from the nightly run: it runs on the default branch, so every PR can read them.

### 4. The alert

The last step of the suite job, with `if: always()`, so it sees the job's real status (`success`, `failure`,
`cancelled`). Not a separate job, which would bill an extra minute per run.
- **Red** (including `cancelled`, because a job that exceeds `timeout-minutes` ends as cancelled and cannot reliably be
  told apart from a manual cancel): open an issue with a fixed label, or comment on the open one, **assigned** to the
  person who must act and mentioning them. Mobile push notifications are typically sent for assignments and direct
  mentions, not for every new issue; verify this in the provider's notification docs. Include the run link, the commit
  and the first failing test.
- **Green**: close the open issue with a comment.
- **Heartbeat monitor (optional)**: a URL pinged on green and on "no changes", with a failure ping on red (many
  services accept a `/fail` suffix). Set its period to the cron interval and its grace to cover the measured cron delay.
  Its real value is the dead-man's switch: it also fires when the nightly stops running at all, which an issue never
  can. Never send the healthy ping in "cap after red" mode.
- Without the monitor's secret, log that it is missing and do not fail.
- An alert failure (no permission, network) logs a warning and does not change the job's colour.
- `issues: write` only on the job that writes issues.

### 5. The local record and the merge gate (`templates/local-record.md`)

The gate that replaces the suite on every PR. A wrapper script runs the whole local suite and, only if every step is
green, appends one line to a file outside the versioned tree, shared by all worktrees (for example under
`git rev-parse --git-common-dir`):
- commit, tree (`HEAD^{tree}`), date, script version, the steps run, and the conditions below as explicit booleans;
- the run used a production build; every test ran (compare the executed list with the runner's `--list` output, so a
  stray `.only` cannot pass with one test);
- the working tree was clean at start and at end (`git status --porcelain`, untracked files included), and `HEAD` did
  not move; dependencies matched the lockfile;
- no argument or environment variable that skips the build, the database reset, the server or the full list.
The project's merge command then refuses a PR to `integration` unless a record exists whose tree equals the PR head's
tree, or whose commit is an **ancestor** of the head with only documentation between them. A PR whose own diff
(`base...head`) is only documentation needs no record, and the output says so. Any error is a refusal. There is no
flag to skip it.

Limits to write down where the team reads them: it tests the branch head, not its merge with an `integration` that moved
(the nightly covers that); it runs on the developer's operating system; a separate clone does not see it (the merge
command refuses, which fails closed); anyone can write the file by hand.

### 6. The push guard

Without CI on `push` to `integration`, a commit pushed straight to it passes no gate. Add a hook or wrapper that denies
pushes whose destination is `integration` or `production` (including `HEAD:<branch>`, force-push refspecs, and API merge
or ref-update calls), except a plain push from a checkout of `integration` that a local check approves: everything
between `origin/integration` and `HEAD` is documentation, or the tree of `HEAD` has a valid record. Keep the hook's
total runtime well under its timeout: a hook that times out fails open.

### 7. The documentation list

One module that every decision imports (nightly decision, record lookup, merge gate, push guard). Files that change
the process itself (hook registrations, settings that load guards) count as code even if they live in a docs-like
folder.

## Landing order

The PR that introduces this changes which checks exist, so plan the order so there is neither an unguarded window nor a
PR that can never merge:
1. The PR's final head is green on the new cheap checks, and has a valid local record.
2. Change the required checks on `integration` with a targeted update of the required status checks (not a replacement
   of the whole protection), verified against a read of the current settings first.
3. Merge immediately, with a merge command that already contains the new gate.
4. Update local checkouts of `integration`.
5. Trigger the first nightly run manually with `force` (a `workflow_dispatch` workflow must exist on the default
   branch before it can be triggered).
Between 2 and 3, an open PR built with the old workflow lacks the new check and stays pending: that fails closed. If 3
is delayed, the PR stays mergeable because it already publishes the new checks.

## Post-merge checklist

Each item names the expected result; record the run IDs.
1. **Forced first run** (`force`): suite green, tested-tree marker published, alert closes nothing and sends the
   healthy heartbeat.
2. **"No changes" run** right after: the decision job reports "cap" or "no changes" with its reason, the suite job is
   skipped as a job, and this run does not become a reference.
3. **Alert test** (`test_alert`), after warning whoever receives the alert: an assigned issue and a failure ping; then
   close the issue.
4. **A real red run on a throwaway branch**: break a cheap, early step of the suite and trigger the nightly workflow on
   that branch with `force`. This exercises the wiring the alert test cannot (the `always()` step after a failure, the
   job status, the job's permissions). Delete the branch and close the issue afterwards.
5. **The first scheduled run**: note when it actually started compared with the cron, and that it decided correctly.
6. **A week later**: measure again with the same method as before (`MEASURE.md`), per cost item, and compare with the
   projection and with the official billing page read at the same hour. Until then, the savings are projected.
