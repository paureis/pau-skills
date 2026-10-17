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
- **"I would have done it differently"** is the most common false positive in review: another structure, another
  library, another pattern, a refactor. It names no failure until it shows a concrete problem with the approach the
  change took, such as an input that breaks it or a requirement it misses. Without one it is a preference: leave it,
  and write why in the table ("another approach, no failure shown") so it is not argued again. With one, the problem
  is the finding; check and rate it like any other. A security concern dressed as an alternative (for example "use a
  parameterized query instead of string formatting") is a security finding: it goes by the security rule below, never
  by this one.
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
A control is a run that would fail if the fix were wrong, and does: the old code fails the new test, or the wrong
input is rejected while the right one passes.

**Fix if cheap**: a real failure that is not on the list, with low effort and low fix risk. Typical cases: a false
positive, a wrong or misleading message, new behaviour without a test, a doc the change made untrue. Fix it in this
change when the fix is small and stays in the files the change already touches. Otherwise open an issue. A fix that
needs a new file, other than a test, is not small.

**Leave**: preferences (style, naming, a refactor someone would like), checks for states shown to be impossible, and
anything outside the change. A real bug outside the change gets its own issue, not a fix here.

| | Fix risk low | Fix risk medium or high |
|---|---|---|
| On the must-fix list | Fix now | Fix now, with a control and a closer second look |
| Real failure, low effort | Fix now | Issue |
| Real failure, medium or high effort | Issue | Issue |
| No failure named | Leave | Leave |

**Nitpick gravity.** Reviewers fill the space they are given, AI reviewers and reviewers told to be hostile most of
all: with nothing serious to report, they inflate nits. When every finding, after steps 1 and 2, turned out to be a
preference or a low-value nit, say so about the whole review: the change is probably fine. Do not read a long list of
nits as a sign of a bad change, and do not ask for another review to be sure. This is a conclusion about the review,
reached after each finding was checked; it is never a reason to skip step 2, and it is not a bucket (the nits still go
to Leave, or to fix if cheap when they name a small real failure). It does not apply while any finding that names a
failure is still open: not yet reproduced or disproved, or waiting on the maintainer. It does not apply when any
finding is a must-fix.

## 5. Write it down

One line per finding, including the ones left, so the decision can be seen and is not argued again:

```
| # | Finding (file:line) | Failure named | Value | Effort | Fix risk | Bucket | Action |
|---|---|---|---|---|---|---|---|
| 1 | src/report.py:88 | empty list prints "None items" | medium | low | low | fix if cheap | fixed in <commit> |
| 2 | src/core/pick.py:40 | none (prefers a dict) | | | | leave | preference |
| 3 | src/sync.py:12 | retry on 409 could double-write | high | medium | high | must fix | fixed in <commit>, control run |
| 4 | src/cli.py:200 | wrong exit code on --help, outside this change | low | low | low | leave | issue to open |
| 5 | src/api.py:30 | none (would split it into a class) | | | | leave | another approach, no failure shown |
```

When a learned pattern (section 9) decided a finding, name it in the Action column.

Put the table in the pull request description, or in the session when there is no pull request.

## 6. The fix round

1. **Commit the reviewed state first.** The commit the review looked at is where the fix round starts. Write its
   hash down.
2. **Test first.** Each fix comes with a test that fails without it. Write the test, run it, and watch it fail for
   the reason the finding names. Then fix, and watch it pass. A fix to documentation needs no test.
3. **Check the fix's scope** with the `fix` command of `review-scope.mjs` (SKILL.md has the full command):
   `fix --since <reviewed commit>`, plus `--base <the commit the change started from>` when the work is committed on
   the base branch itself. Answer each flag before the second look:
   - `NO_TEST`: add the missing test.
   - `RISKY`: confirm the fix is for a must-fix. If it is not, revert it and open an issue.
   - `OUTSIDE`: revert that code and open an issue, unless it is part of a must-fix. A new file counts as outside.
4. **The second look covers only the fix**: the diff the script prints, plus any new files it lists, read against
   the finding it fixes. It does
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

## 9. Recurring findings: learned patterns

When the same kind of finding is left again and again for the same reason (a review tool that always flags something
that keeps turning out to be fine here), write it down once, so the next triage reaches the same answer faster and
with the same limits. A pattern can also point the other way: findings of this kind have always been real here, so
fix by default.

Keep the patterns where the project can find them again: a file the maintainer agrees to, for example
`.claude/review-patterns.md`, or a section of the project's review notes. Ask before creating the file. One entry per
pattern:

```markdown
### <short pattern name>

- Confidence: candidate | recurring | strong
- Skip when: <conditions that must all be true>
- Do not skip when: <the risk boundaries>
- Example signal: <phrases or code context that identify the pattern>
- Source: <the pull request, review or commit where it was seen>
```

- **candidate**: one or two examples. You may add a candidate yourself, with its source.
- **recurring**: several real reviews left a finding of this kind, each listed as a source.
- **strong**: narrow, checked again and again, and low risk.

Moving a pattern to recurring or strong needs the maintainer's yes: show the entry and its sources, and write it only
on a yes.

A pattern does not replace step 2: the finding is still checked, and the pattern says what to look at and why it
usually comes out fine. A recurring or strong pattern may send a finding to Leave, with the pattern's name as the
reason, only when step 2 did not reproduce or trace the failure, every "skip when" condition holds and no "do not skip
when" one does. A failure that step 2 reproduced or traced takes its bucket from section 4, whatever the pattern says.
A "fix by default" pattern goes through section 4's table too: a real failure with medium or high effort or fix risk
is still an Issue, unless it is on the must-fix list. A candidate is a hint, not a skip.

No pattern ever skips these, whatever earlier reviews did with something similar:

- a finding on the must-fix list. A learned pattern never turns a must-fix into a leave.
- security, privacy, access, billing, data retention and permission findings
- migration, schema, idempotency, concurrency and cross-system findings, and any finding of high value
- a finding whose fix is small and clearly lowers risk without changing what the code is meant to do

A person who once dismissed a security finding made an owner's call on that change. It is not a skip rule for
everyone; do not write it up as a pattern.

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
If you find nothing serious, say so. Do not fill the list with nits.
Review only the change, not the code around it, unless the change breaks that code.
End with anything you were unsure about.
```
