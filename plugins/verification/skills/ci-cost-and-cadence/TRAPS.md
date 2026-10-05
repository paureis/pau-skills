# Traps

Each trap below has produced, or nearly produced, a green check that tested nothing, a bill that kept growing, or a PR
that could never merge. Where a trap is a platform fact, the "Verify" line says where to confirm it: platforms change,
so check the current documentation instead of trusting this file. The documentation pages named are GitHub's; other
providers have equivalents.

## Required checks

1. **A skipped or neutral required check counts as passed.** A job skipped by `if:` reports success; the successful
   states for a required check are `success`, `skipped` and `neutral`. A job can also end green having run nothing, if
   its steps are skipped inside it.
   *Do*: a required check must either always run the real work, or be a gatekeeper that runs always and succeeds only on
   positive proof (an explicit result and an output that says what ran). Never let it conclude `neutral`.
   *Verify*: "Troubleshooting required status checks" and "About protected branches".

2. **Jobs that `need` a skipped or failed job are skipped too**, and therefore count as passed if required.
   *Do*: no `needs:` on a required job unless it has an explicit condition that fails closed; prefer no `needs:` at all.
   *Verify*: "Using jobs in a workflow" (the `needs` section) and "Expressions" (the default `success()` condition).

3. **The required check name must have a single possible owner.** Protection usually matches by name and by the app
   (all of Actions), so any job in any workflow with that name can satisfy it. A name built with an expression may or
   may not be evaluated when the job is skipped; that behaviour is not documented.
   *Do*: a literal name, one job, one workflow file with a single trigger, no job-level `if:` or `needs:`. A test that
   reads every workflow file (`.yml` and `.yaml`) and asserts the name appears exactly once, and that no job name
   contains `${{`.

4. **Never use `paths` or `paths-ignore` on `pull_request` for a workflow that publishes a required check.** When the
   workflow does not run, the check stays "Expected / Waiting" forever and the PR cannot merge. `[skip ci]` in a commit
   message has the same effect.
   *Do*: decide "nothing to test" inside a job that always runs.
   *Verify*: "Troubleshooting required status checks", "Skipping workflow runs".

5. **Checks attach to the PR's head commit, and only the latest commit counts.** A green check from an earlier commit
   does not satisfy protection after a push. Which of several same-named check runs on one commit counts is not clearly
   documented.
   *Do*: design so that every same-named check run on a commit would be correct on its own.

6. **A status posted from a developer's machine does not satisfy a check bound to the Actions app**, and making the
   check accept any source lets anyone with push access post it for any commit.
   *Do*: keep local evidence local (the record and merge gate), not as a fake CI status.

## Scheduled and manual runs

7. **Scheduled workflows run on the default branch and can start hours late**; the start of the hour is the busiest.
   *Do*: measure this repository's actual delay from past scheduled runs; pick an odd minute and an hour that still
   lands outside working hours after the delay; give a heartbeat monitor a grace period that covers it.
   *Verify*: "Events that trigger workflows" (`schedule`).

8. **A nightly job must not publish the release check's name**, because the tip of the integration branch is the head of
   the release PR. A skipped or empty job with that name on that commit could satisfy production's protection.
   *Do*: a different literal name for the nightly suite job, and the release check in its own file.

9. **"No changes tonight" must skip the job, never its steps.** A job with every step skipped concludes `success`; if the
   next night uses "last green run" as its reference, an empty run becomes the reference and the chain of empty nights
   never breaks.
   *Do*: skip the suite job with a job-level `if:`, and define the reference as a green suite job that published a
   tested-tree marker in its last step.

10. **A cap must count failed, cancelled and timed-out runs**, or every trigger after a hung or broken suite pays the
    full run again (and a hung run bills its whole timeout). A cap after a red run must also not send the healthy
    heartbeat, or the monitor closes the incident with nothing fixed.

11. **A job that exceeds `timeout-minutes` ends as cancelled**, and `always()` steps see `cancelled`.
    *Do*: in the nightly alert, treat `cancelled` as red. A spurious issue is cheap; silence on a hung suite is not.

12. **`workflow_dispatch` only works once the workflow file is on the default branch**, and it takes a branch, not a
    commit: it tests whatever that branch's head is when the run starts, not the merge with anything.
    *Do*: land the workflow before relying on dispatch; to test a red run, dispatch on a throwaway branch (`--ref`).
    *Verify*: "Manually running a workflow" (which ref's workflow definition is used).

## The local gate

13. **A merge gate that compares against the merge base accepts the wrong record.** A three-dot comparison
    (`compare/A...B` in the GitHub API) lists changes from the merge base of A and B to B, not between the two trees. If
    the tested commit is not an ancestor of the head (a stacked branch tested at its child, a reset that dropped a fix),
    code the head lacks disappears from the list and "docs only" passes.
    *Do*: accept a record by tree equality, or only if the tested commit is an ancestor of the head (`status` ahead or
    identical and `behind_by` 0, or `git merge-base --is-ancestor`), then compare. Test it with a non-ancestor whose
    three-dot diff is docs only.

14. **Hooks that time out fail open.** A guard hook killed for exceeding its timeout does not block the command.
    *Do*: keep every wait inside the hook bounded and their sum well under the hook's timeout; measure it.

15. **A local record is a guard against forgetting, not against fraud.** It is a text file. Say so where the team reads
    the rules, and do not present it as a security control.

16. **Environment variables and arguments can quietly weaken a local run** (skip the build, skip the database reset,
    point at another server, run a subset, CI mode with different retries). *Do*: refuse to write a record when any is
    set, and record the conditions so the merge gate can check them.

## Changing protection and landing

17. **Changing required checks is a targeted update, not a replacement of the whole protection.** A `PUT` of branch
    protection replaces every setting; an incomplete body can drop force-push and deletion bans or review rules.
    *Do*: update only the required status checks (on GitHub, `PATCH .../branches/<b>/protection/required_status_checks`
    with the check names and the app id read from the current settings), and read the settings before and after.

18. **The PR that changes CI tests itself with the new CI.** Its runs use the workflow files from the PR's merge
    commit, so it can neither pass the old required checks it no longer publishes nor prove the paths that only exist
    after merge (scheduled runs, dispatch on the default branch).
    *Do*: plan the order (protection change, merge, first manual run) as in `NIGHTLY.md`; prove the expensive path once
    with a temporary trigger in the first push and remove it in the second; leave the rest to the post-merge checklist.

19. **A PR can loosen its own guard by editing the workflow or the test that checks it.** Inherent to CI that reads its
    configuration from the change under test. *Do*: structural tests on the workflow files, and review of any diff
    under the workflows folder.

20. **Merge queues are not available on every plan**, and when they are, they need their own trigger (`merge_group`)
    and run the suite again per queued PR. Check availability before designing around one.
