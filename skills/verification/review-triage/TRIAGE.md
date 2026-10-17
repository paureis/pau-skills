# Review triage: the method

How to decide which review findings to act on, and when a review is finished. It works for any review: a person, an
AI review tool, a review bot or a subagent. It is judgement, not measurement. The ratings below are a way to think
about a finding, and they are never added up into a score.

The problem it solves: reviews, AI reviews most of all, can always find one more thing, and each fix can bring a new
bug, so the review and fix loop never ends. The method puts limits on what is worth changing and on how many rounds
there are.

## 1. A finding names a failure

For each finding, write down the failure it claims: this input or state, this wrong result. For example: "with an
empty cart, `total()` returns None and the page shows 'None items'".

- A finding that names no failure is a **preference**. It goes to Leave, and the change does not wait for it.
- A failing test, build, typecheck or lint is a failure in itself.
- A **security finding** that describes a risk but shows no failure yet is not dropped. Trace it (step 2). If you
  cannot settle it either way, it goes to the maintainer.

If you can brief the reviewer, ask for this up front (see "Reviewer prompt" below). It removes most weak findings
before they reach triage.

## 2. Check the claim

Reproduce the failure, or trace a real path to it from a real caller or input. Read the code; do not trust the
finding's description of it.

- Reproduced or traced: rate it (step 3).
- Not reproduced and not traced: say so in the table. A claimed must-fix goes to the maintainer with what you tried.
  Anything else goes to Leave as "could not reproduce".

"That state cannot happen" has to be shown, not assumed: the type system rules it out, or a check at the boundary
already rejects it (name the line). If you cannot show it, the state can happen, and the finding is about input
nobody handled. Rate it like any other finding.

## 3. Rate it three ways

Rate each one low, medium or high:

- **Value of fixing**: how bad the failure is and how likely someone is to reach it.
- **Effort**: how much code and how many files the fix needs.
- **Risk of the fix**: how likely the fix is to break something else. It is high when the fix lands in the project's
  risky paths, changes behaviour that other code relies on, or needs files the change did not touch.

Weigh the fix, not only the problem. A small fix in the riskiest code can break more than it repairs. When the
problem is minor and the fix is risky, open an issue instead.

## 4. Pick the bucket

**Must fix** (blocks the merge): the failure is on the must-fix list. The defaults are a security hole, data lost or
written to the wrong place, a wrong result on the main path, a broken build, install, test run, typecheck or lint, and
a failed contract or acceptance criterion. Each project adds its own (see the configuration in SKILL.md). A must-fix
is fixed whatever the effort. When its fix is risky, it gets a control and a closer second look; it is not skipped.

**Fix if cheap**: a real failure that is not on the list, with low effort and low fix risk. Typical cases: a false
positive, a wrong or misleading message, new behaviour without a test, a doc the change made untrue. Fix it in this
change when the fix is small and stays in the files the change already touches. Otherwise open an issue.

**Leave**: preferences (style, naming, a refactor someone would like), checks for states shown to be impossible, and
anything outside the change. A real bug outside the change gets its own issue, not a fix here.

| | Fix risk low | Fix risk medium or high |
|---|---|---|
| On the must-fix list | Fix now | Fix now, with a control and a closer second look |
| Real failure, low effort | Fix now | Issue |
| Real failure, medium or high effort | Issue | Issue |
| No failure named | Leave | Leave |

## 5. Write it down

One line per finding, including the ones left, so the decision can be seen and is not argued again:

```
| # | Finding (file:line) | Failure named | Value | Effort | Fix risk | Bucket | Action |
|---|---|---|---|---|---|---|---|
| 1 | src/report.py:88 | empty list prints "None items" | medium | low | low | fix if cheap | fixed in <commit> |
| 2 | src/core/pick.py:40 | none (prefers a dict) | | | | leave | preference |
| 3 | src/sync.py:12 | retry on 409 could double-write | high | medium | high | must fix | fixed in <commit>, control run |
| 4 | src/cli.py:200 | wrong exit code on --help, outside this change | low | low | low | leave | issue to open |
```

Put the table in the pull request description, or in the session when there is no pull request.

## 6. The fix round

1. **Commit the reviewed state first.** The commit the review looked at is where the fix round starts. Write its
   hash down.
2. **Test first.** Each fix comes with a test that fails without it. Write the test, run it, and watch it fail for
   the reason the finding names. Then fix, and watch it pass. A fix to documentation needs no test.
3. **Check the fix's scope**: `node "${CLAUDE_SKILL_DIR}/review-scope.mjs" fix --since <reviewed commit>`. Answer
   each flag before the second look:
   - `NO_TEST`: add the missing test.
   - `RISKY`: confirm the fix is for a must-fix. If it is not, revert it and open an issue.
   - `OUTSIDE`: revert that code and open an issue, unless it is part of a must-fix.
4. **The second look covers only the fix**: the diff the script prints, read against the finding it fixes. It does
   not review the whole change again. It asks two things: does the fix remove the named failure (the new test failed
   before and passes now), and did it break anything near it (the project's checks pass)?

## 7. The limits

**One review round and one fix round.** After the second look:

- Clean: the review is done.
- The second look finds something new: a must-fix goes to the maintainer, with the finding, the failure and what you
  would do. Anything else becomes an issue. There is no third round.
- A finding repeats one that was already left: it stays left, unless the reviewer now names a failure.

Each fix round can add a bug, and a reviewer can always find one more thing. The limit puts the remaining risk in
front of a person instead of inside a loop.

## 8. Review before building pays more

A finding on a plan costs a sentence to fix. The same finding on code costs a fix round. When the work adds new
behaviour, have someone check the plan against the real environment before anything is built: what the code, the CI,
the runtime and the deploy target actually have, and which of the plan's assumptions are false. The bar for acting on
a plan finding is lower: fix anything real.

## Where this fits with other checks

An evaluator that grades an increment against a contract keeps going until two rounds in a row are clean. That is a
different job: it decides whether the increment meets its contract, and its rounds are its own. Triage decides which
findings from a review are worth acting on. When both run, a failed contract assertion is a must-fix.

## Reviewer prompt

When you brief a reviewer (a subagent, a review tool that takes instructions, or a person), add this:

```
For every finding, give:
- the file and line
- the input or state that triggers it
- the wrong result it produces
- how you know: ran it, traced it in the code, or suspect it
A finding without a wrong result is a preference: label it "preference" and keep it short.
Review only the change, not the code around it, unless the change breaks that code.
End with anything you were unsure about.
```
