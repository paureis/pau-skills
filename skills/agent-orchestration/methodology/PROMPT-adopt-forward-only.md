# Adopt Prompt: forward-only, for a project that already ships

The third door into this kit, and the right one for most existing projects.

| Door | Use when | Cost |
|---|---|---|
| `PROMPT-new-project.md` | Empty repo | ~1 hour |
| **`PROMPT-adopt-forward-only.md`** | **Existing project that works. You want the discipline on NEW work only.** | **~1 session** |
| `PROMPT-retrofit-existing-project.md` | You specifically want to know how much of the shipped surface is actually verified | Several sessions, and the audit is the point |

**These are alternatives, not stages.** Adopting forward-only does not mean the
retrofit is pending. If you later want the audit, run it deliberately, on its own
schedule, as a decision, not as a tax on the next feature.

---

## The trade you are making, stated plainly

The retrofit door exists because a shipped surface that was never independently
verified is a surface where **nobody knows** what works. Forward-only does not
answer that question. It declares it out of scope and moves on.

That is a legitimate choice, and it stays legitimate **only if you write the
choice down.** The failure mode is not skipping the audit; it is skipping the
audit and then, six weeks later, reading the absence of findings as evidence of
health. Silence is not a pass.

So the single non-negotiable of this door is the **trust line** in Step 2. Skip
everything else here before you skip that.

---

## What you are NOT doing

- **Not writing a retro-contract** for anything already shipped.
- **Not auditing** the existing surface.
- **Not mutation-verifying the existing test suite.** However many tests exist,
  they stay exactly as trusted (or untrusted) as they are today.
- **Not fixing things you notice while installing.** Write them in the backlog.
  An install session that turns into a bug hunt is the retrofit door with extra
  steps, which is the thing you chose not to do.
- **Not adding a verification phase before the next feature.** The next feature
  starts in the next session.

---

## The install: one session

### 1. Read the method

Read `METHODOLOGY.md` in this repo. It defines every term below: contract,
evidence standard, generator/evaluator separation, convergence, mutation
verification. Do not proceed on your memory of what those words usually mean.

Note as you read: **every one of the seven mechanisms is per-increment.** None of
them require looking backwards. That is why this door exists.

### 2. Draw the trust line: the one step you may not skip

Record, in `PROJECT.md` under an `Honest accounting` heading:

```
## Honest accounting

Trust line: <commit SHA> on <branch>, <YYYY-MM-DD>.
Everything at or before this commit is ASSUMED GOOD. It has not been
independently verified against a contract. Absence of known defects in this
surface is absence of evidence, not evidence of absence.
Everything after this commit is subject to the operating rules in CLAUDE.md.
```

Use the real SHA of `HEAD` at install time. Do not soften the wording. A future
agent (and a future you) will read this file and needs to know which half of
the codebase carries evidence and which half carries an assumption.

### 3. Create the state files

`PROJECT.md` and `log.md` from `templates/`.

**Do not duplicate state the project already keeps.** If there is already a
backlog, a roadmap, or per-feature summary docs, they stay the source of truth
and `PROJECT.md` *points at them*. `PROJECT.md` holds only: current increment,
open gate, next action, done / in-flight / blocked, and the honest-accounting
block from Step 2. A second copy of a list drifts within a week.

Backfill `log.md` with one line per milestone from git history, dated and terse.
This is context for a future agent, not a chronicle.

### 4. Merge the rules

Merge `templates/CLAUDE-rules-forward-only.md` into the project's `CLAUDE.md`.

**Keep every existing rule.** Architecture decisions, naming conventions,
behavioral rules, deployment discipline: those are hard-won and this adds an
operating discipline on top of them, it does not replace a design. Where an
existing rule already says something this block says, keep theirs and delete the
duplicate. Two phrasings of one rule is how a rule stops being followed.

Fill every `[bracket]`:

- **The risky set**: derive it from what the code actually touches, don't
  copy the example. Read the dependency list and the schema. Anything where
  being wrong is expensive *and silent* belongs in it.
- **The tier examples**: name real changes from this repo's history, one per
  tier. Abstract tiers get argued about; a named precedent gets followed.
- **The gate list**: anything touching money, identity, brand, customer data,
  production, or a published artifact.
- **The verification commands**: the actual commands, verified to run.

### 5. Prove the state files work

Fresh session. Give it only `PROJECT.md` and `log.md`. Ask what to do next.

If it cannot answer correctly, the state files are wrong. Fix them now, while
it is cheap. Record the result in `log.md`. This takes five minutes and is the
only test in this entire install.

### 6. Commit, and stop

One commit. Do not start a feature in this session.

Report: the trust line SHA, what you filled into each bracket and why, anything
you noticed but deliberately did not fix, and (explicitly) that nothing about
the existing surface was verified by this session.

---

## After the install, there is no methodology session

This is the part people get wrong. The discipline is now **ambient**: it lives in
`CLAUDE.md` and fires on every task, at the tier that task earns. There is no
recurring ceremony, no phase to enter, no gate to open before ordinary work.

Every increment from here:

1. **Pick the tier first, before any code.** State it out loud, with the reason.
   Picking it afterwards means picking whichever tier the work you already did
   happens to satisfy.
2. Contract, evaluator, and convergence scale with that tier; see the rules
   block for the table.
3. **Mutation-verify guards you wrote in this increment.** Never a sweep of
   pre-existing tests. If you write a test claiming to prevent X, introduce X,
   watch it go red, revert. Two minutes. It is the cheapest rule in the method
   and the one people skip.
4. Update `PROJECT.md`, append to `log.md`.

## Where the old surface gets touched: the contagion rule

The one place forward-only is allowed to look backwards, and it is narrow on
purpose.

**When a new increment depends on existing behavior, that one behavior gets one
assertion with a verify clause. Not the module it lives in. Not the subsystem.
The behavior you are standing on.**

Three outcomes, and the third is the one to get right:

- **Evidence exists**: name it in the increment's doc, move on. Costs minutes.
- **No evidence**: do not audit and do not fix. Either write the smallest test
  that proves the behavior you depend on, or mark it `ASSUMED` and add it to the
  honest-residual list in `PROJECT.md`. Both are acceptable; pretending you
  checked is not.
- **Evidence contradicts it: you have found a real pre-existing defect.**
  **Do not fix it inside this increment.** Record it in the backlog, tell the
  owner, and let them decide whether the increment proceeds, waits, or reroutes.
  Fixing it here is how a two-day feature becomes a two-week refactor, which is
  the failure this whole door was chosen to avoid.

Over time this audits the old surface exactly where new work rests on it, and
nowhere else. That is not full coverage and must never be reported as full
coverage, but it is the coverage that was load-bearing.

## Reporting

You will be tempted to describe an install session as making the project safer.
It did not. It made the *next* increment verifiable and it wrote down what is
currently assumed. Say that, and say the trust line SHA out loud.
