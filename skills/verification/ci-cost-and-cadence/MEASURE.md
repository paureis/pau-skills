# Measure before designing

Two questions, answered from the CI provider's API, before any design: where do the minutes go, and what has the
expensive suite actually caught. The commands are for GitHub Actions with the `gh` CLI; the method carries to other
providers. Read only: nothing here starts, re-runs or cancels a run.

Before the first call, check that `gh` is logged in to the account that owns the repository (`gh auth status`) and
that `gh repo view --json nameWithOwner` names the repository you mean.

## 1. Where the minutes go

### The billing rule (estimate)

For hosted runners, GitHub bills each job rounded up to the whole minute, with a minimum of one, times the runner's
multiplier (Linux 1; Windows and macOS cost more). So:

```
billed(job) = max(1, ceil((completed_at - started_at) / 60 s))   for every job that ran (not skipped), every attempt
```

Consequences that surprise people:
- A cancelled run bills what it ran before the cancel. `cancel-in-progress` saves the rest of the run, not the part
  already spent.
- A failed run bills like any other. A run that fails at minute 18 costs 18.
- A ten-second job bills a full minute. A decision job, an alert job and a gatekeeper job each add one minute per run.
- Scheduled workflows on a private repository bill too.

Verify the rule and the multipliers on the provider's current billing page before quoting them.

### The official figure

The official usage may need a token scope the CLI does not have (on GitHub, the billing endpoints under
`/users/<user>/settings/billing/` or `/orgs/<org>/settings/billing/` need the `user` or an org admin scope). The
per-run `timing` endpoint may report zero billable time on the newer billing platform. When you cannot read the official
figure, say so, label every number as an estimate, and ask the owner to read the billing page at the same hour you run
the estimate, so the two can be compared.

### The commands

```bash
# Runs since a date (paginated). Add &event=pull_request or &branch=<name> to narrow.
gh api "repos/<owner>/<repo>/actions/runs?created=>=2026-01-01&per_page=100" --paginate --slurp > runs.json

# Jobs of one run, all attempts (a re-run attempt bills again).
gh api "repos/<owner>/<repo>/actions/runs/<run_id>/jobs?filter=all&per_page=100" --paginate --slurp

# Runner labels, to confirm the multiplier (every job on ubuntu-* means multiplier 1).
gh api "repos/<owner>/<repo>/actions/runs/<run_id>/jobs" -q '.jobs[].labels'

# Cache and artifact storage (not minutes, but storage counts against the plan).
gh api repos/<owner>/<repo>/actions/cache/usage
gh api "repos/<owner>/<repo>/actions/artifacts?per_page=100" -q '.total_count'
```

Or run the bundled script, which does the above and groups the result (Node 20+, `gh` logged in, no packages):

```bash
node "<skill folder>/measure-minutes.mjs" --repo <owner>/<repo> --since 2026-01-01 [--until 2026-01-08] [--by workflow|event|job|branch]
```

It prints estimated billed minutes per group, the number of runs and jobs, and how much of the total came from
cancelled and failed runs. It is an estimate by the rule above, never the bill.

### What to tabulate

| Cut | Why it matters |
|---|---|
| By workflow and event (`pull_request`, `push`, `schedule`, `workflow_dispatch`) | Shows whether pushes to the main branch repeat what the PR already ran |
| By job | Usually one job (end-to-end, integration) is most of the minutes |
| By conclusion (success, cancelled, failure) | Cancelled plus failed is often a third or more of PR minutes |
| By PR: runs, full runs, minutes; median and maximum | A few long PRs often dominate; the median tells you what is typical |
| Runs after the PR's first green full run, and what they touched (app code, tests, docs only) | Decides whether "once per PR" can work |
| Per day, and the month projected at that rate | "At this rate the allowance runs out on day N" is the number the owner needs |

Worked example (anonymised): a project at about 240 minutes a day against a 3,000-minute monthly allowance would run
out around day 12 and finish the month near 7,000. The end-to-end job was over 80% of CI minutes; 30 of 46 PR runs in
the period came after the PR's first green run (review rounds, docs, fixes); cancelled and failed runs were 40% of PR
minutes.

## 2. What the expensive suite has caught

List every run since a date in which the expensive job concluded `failure`. For each, find the first failing step from
the jobs API (`steps[].conclusion`), read the job log for the failing tests (`gh api repos/<o>/<r>/actions/jobs/<id>/logs`),
and find the commit that fixed it (`git log`, the PR, the project's log or changelog). Then classify:

| Class | Meaning | How to tell |
|---|---|---|
| (a) | A real defect that a full local run would not have seen | The fix touched application code, and the failure depended on the CI environment in a way the local run cannot reproduce (operating system, a production build the local run did not use, a browser engine only CI has) |
| (b) | A defect a full local run would have seen | The fix touched application code or generated files, and the failure reproduces locally with the project's current local procedure |
| (c) | Flaky test or infrastructure | Passed on retry, or the fix touched only the test; network, rate limits, a service that failed to start |
| (d) | A mistake in the workflow or lockfile | The fix touched only CI configuration, lockfiles or CI scripts |

Judge (a) against (b) by the local procedure as it is today, and say when the rule was different at the time. Count
both runs and distinct causes: ten red runs from one calendar bug are one cause. Then write the counterfactual for each
(a) and (b) defect: under each option, how long would it have stayed on the shared branch or staging, and could it have
reached production?

If (a) is near zero, the expensive suite on every push mostly converts (c) and (d) into waiting time and minutes. If
(a) is significant, the case for a nightly model is weak; consider making the suite faster instead.

## 3. Time

Measure, do not guess: wall-clock time of a green full run in CI (median and range), of the cheap checks alone, and of
a full local run on the machines actually used. A full local run that is faster than CI and free is the asset the
nightly model depends on.
