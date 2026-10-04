# New-Project Prompt — install the method before there is any code

Copy the kit folder into the empty (or nearly empty) repo, then paste everything
below the line into a fresh Claude Code session.

This is the cheap version. Retrofitting costs an audit; installing costs an hour.

---

You are bootstrapping a new project under a specific engineering discipline.

**Read `METHODOLOGY.md` in this repo first, in full, before writing anything.**
It defines every term used below. Do not proceed on your memory of what
"contract," "evaluator," or "convergence" usually mean — this document means
something narrower by each of them.

Then work through the following, stopping where told. Stopping matters: the
separations between sessions are load-bearing, not stylistic.

## Step 1 — Understand what is being built

Ask the owner what they're building, for whom, and what would make it a failure.
Ask what is irreversible about it — what touches money, identity, brand, customer
data, or anything published.

Do not propose a stack yet. Do not scaffold anything.

## Step 2 — State files

Create `PROJECT.md` and `log.md` from `templates/`. Then **run the resumability
test**: open a fresh session, give it only those two files, ask it what to do
next. If it can't answer, fix the files. Record the result in `log.md`.

Do this now, while the project is small enough that the test is trivially cheap
and its failure is trivially fixable.

## Step 3 — Operating rules and gates

Create `CLAUDE.md` from `templates/CLAUDE-rules.md`.

Fill in the **gate list** from the owner's answer about what's irreversible.
These are the actions you prepare and never perform. Get the owner to confirm the
list explicitly — it is the one part of this document they are the authority on,
and a gate discovered later is a gate discovered after it was needed.

Add any hard constraints: budget ceiling, disqualified domains, recency
requirements, non-negotiable architecture choices.

## Step 4 — Falsify the design premises, before any code

Identify the assumptions the design rests on — the ones where being wrong means
rebuilding rather than patching. Typically: how an external API actually behaves,
what a platform guarantees by default, what the database enforces on your behalf,
what a protocol's tokens actually prove.

For each, go find out. Primary sources, live, dated. Then attack what you found
from at least two independent angles before you believe it.

Write the results down with citations and dates. Anything you could not confirm
live gets **explicitly zeroed** — recorded as unknown, never as probably-fine.

This step routinely changes the plan, and that is the entire return on it. A
premise corrected here costs a research pass. The same premise corrected after
implementation costs the implementation.

Stop. Update state. New session.

## Step 5 — Contract

Write `contract.json` from `templates/contract.template.json`, before any
implementation exists.

- Every assertion gets a `verify` clause naming concrete, reproducible evidence.
  If you cannot name the evidence, the assertion is too vague to build against.
- Fill `nonGoals`, `pinnedValues`, and `gradingRule` (copy `gradingRule` verbatim
  from `METHODOLOGY.md` §2).
- Weight the contract toward assertions where being wrong is **expensive and
  silent** — isolation, authorization, data loss, money. Not toward whatever is
  easiest to assert.

Then have the contract itself attacked, in a separate session, by one question:
**"Find an assertion through which a broken build would pass."** Tighten every
one it finds and bump the contract version. Expect this to find something. In the
source project it found two gaps that would each have certified a security hole.

Stop. Commit the contract. New session.

## Step 6 — Plan the increments

Slice the build so that each increment:

- maps to a coherent subset of contract assertions,
- is small enough for one evaluator to attack in a single pass,
- and comes **earlier the higher its stakes**. Build the slice where being wrong
  is expensive and hard to reverse while changing your mind is still free.

Produce an explicit assertion → failing-test map. Every MUST should be traceable
to the test that will prove it.

Stop. Commit the plan. New session.

## Step 7 — The build loop, per increment

1. Write the failing tests from the `verify` clauses. Watch them fail for the
   right reason.
2. Implement until green.
3. **Mutation-verify every guard.** Introduce the defect; watch the test go red;
   revert. A guard you have not broken on purpose has never been tested.
4. Hand to an independent evaluator in a **fresh session** using
   `PROMPT-evaluator.md`. Give it the contract slice and the repo. Give it
   nothing about how or why you built it.
5. Fix what it finds. Run it again.
6. **Converged = two consecutive clean rounds.** Only then does the increment
   count as done, and only then does anything get written down as complete.
7. Update `PROJECT.md`; append to `log.md`; commit.

Never build and evaluate in the same session. Never write the completion note in
the session that did the work.

## Step 8 — Stand up CI immediately

Before the second increment. Tests, type-check, lint, and every gate you built,
on every push.

An unenforced guard decays silently, and the day you discover it decayed is the
day it was supposed to save you. CI is what turns a one-time verification into a
standing one, and it is the cheapest thing in this document.

---

## When something fails

Read the trace. Then choose exactly one:

- **Build-mess** — the contract is right, the implementation drifted. Discard and
  rebuild clean against the contract.
- **Contract-wrong** — the implementation is honest and the contract asked for the
  wrong thing. Stop and escalate to the owner.

Never re-run the same thing hoping for a better sample. If you cannot say which
of the two you are in, you have not read the trace yet.

## Reporting, throughout

Label every claim **built** or **assumed**. Carry `Honest scope:` and `Honest
residual:` notes in `PROJECT.md` for anything deferred, partially covered, or
known-limited. Every projection carries a downside case.

The goal is that a stranger reading your state files knows exactly how much of
this system's correctness is actually *known* — and is never misled by
confidence you have not earned.
