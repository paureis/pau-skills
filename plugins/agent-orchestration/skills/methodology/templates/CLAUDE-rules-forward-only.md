<!-- Merge into the project's CLAUDE.md. Keep every existing rule; this adds an
     operating discipline, it does not replace a design. Where an existing rule
     already says one of these things, keep theirs and delete the duplicate.
     Fill every [bracket]. Companion to PROMPT-adopt-forward-only.md. -->

# Operating Rules

Read `PROJECT.md` and `log.md` before acting. `METHODOLOGY.md` defines every term
below; when in doubt it wins over your default reading of the word.

## The trust line

Everything at or before the trust-line commit recorded in `PROJECT.md` is
**assumed good and has not been verified.** Everything after it is subject to
these rules.

Do not treat the absence of known defects in the old surface as evidence of its
health, and never report it that way. Do not audit it, either. See the
contagion rule below for the only sanctioned way this codebase looks backwards.

## Pick the tier before you write code

State the tier and the reason out loud at the start. Choosing afterwards means
choosing whichever tier the work you already did happens to satisfy.

**Pick the lowest tier that genuinely fits.** Ceremony spent on a small change is
not free caution; it is the owner's time, and it trains everyone to route around
the process. When honestly unsure between two tiers, take the lower one and
escalate mid-build if it turns out bigger than expected. Escalating is cheap;
un-spending three hours is not.

| | Tier 1: just do it | Tier 2: one targeted check | Tier 3: full ceremony |
|---|---|---|---|
| **When** | Mirrors a pattern already in this repo, roughly under [N] lines, no new public surface, touches nothing in the risky set | New [route / endpoint / migration / external call], or non-obvious logic, or one genuinely uncertain claim | Touches the risky set · OR spans multiple subsystems · OR is both high-stakes and large-surface · OR the owner asked for thorough |
| **Contract** | None | 3 to 6 assertions with `verify` clauses, inline at the top of the increment's doc, **written before the code** | Real `contract.json`, ~15+ assertions, authored before and separately from the build |
| **Evaluator** | None | One verifier subagent, hostile prior, after the build | Fresh session, hostile prior, no access to how or why it was built |
| **Convergence** | Tests green | One round. A second round **only if** round one found a MUST-level defect | Two consecutive clean rounds |
| **Example here** | [name a real change from this repo] | [name a real change] | [name a real change] |

The tier test, in one line: *could you explain the whole change in 2 to 3 sentences,
and does an existing pattern in the repo already show its shape?* Yes to both →
Tier 1.

**Grounding research is Tier 1, not a shortcut.** Reading the actual code before
touching something sensitive costs minutes and routinely prevents building the
wrong thing. It never justifies escalating a tier.

## The risky set

[List the areas where being wrong is expensive *and silent*. Derive from what the
code actually touches: dependencies, schema, external services. Examples of the
shape: authentication · billing and credit ledgers · tenant isolation · customer
data · paid-API call paths with cost-exhaustion risk · anything immutable by
design.]

Anything in this set is Tier 3 regardless of diff size. A twelve-line change to
an auth check is not a small change.

## Roles are separated

- **Generators** produce. They do **not** grade their own work, and they do not
  author the assertions they will be graded on.
- **Evaluators** assume the deliverable is broken and prove where.
- Never build and evaluate in the same context window at Tier 3.

Ask an evaluator to *review* and you get a review. Ask it to *break* the thing
and default to "refuted" under uncertainty, and you get findings.

**Evidence standard:** a passing automated test, a captured trace, or a live
reproduction. **Not** code review as standalone evidence. **Not** a recorded
fixture where the assertion demands live behavior. `MUST-NOT` assertions must be
shown absent by an enumerable check (registry membership, a grep, a
module-graph gate), something that mechanically cannot miss.

## Mutation verification, scoped to what you wrote

For every test or guard **written in this increment** that claims to prevent X:
introduce X, watch it go red, revert. An unmutated guard is decoration; a test
that cannot fail is a defect and is reported as one.

**Never sweep the pre-existing suite.** That is the retrofit door and this
project did not take it.

**A fix is new content.** A guard that suppresses, filters, or defers fails as
*silence*, so a substantial fix gets the same treatment as the code it replaced:
verify the fix, don't trust the green.

## The contagion rule: the only backwards look

When this increment depends on existing behavior, that **one behavior** gets one
assertion with a verify clause. Not the module. Not the subsystem.

- Evidence exists → name it, move on.
- No evidence → write the smallest test that proves what you depend on, **or**
  mark it `ASSUMED` in `PROJECT.md`'s honest-residual list. Never pretend you
  checked.
- Evidence contradicts it → **you found a pre-existing defect. Do not fix it
  here.** Record it in the backlog, surface it to the owner, let them decide
  whether this increment proceeds. Fixing it inline turns a feature into a
  refactor.

## Restart vs. escalate: never blind-retry

On failure, read the trace first, then choose exactly one:

- **build-mess** → the contract is right, the implementation drifted. Rebuild
  clean against the contract. Do not patch a patch.
- **contract-wrong** → the implementation is honest and the contract asked for
  the wrong thing. Stop, escalate to the owner, amend the contract, rebuild.

Running the same thing again hoping for a different sample is forbidden. If you
cannot say which category you are in, you have not read the trace.

## Never downgrade a standing step silently

If you skip, compress, or substitute anything these rules require (a tier, an
evaluator pass, a mutation check, a gate), **say so in the response, with the
reason, before doing it.** The owner can accept the trade instantly; what they
cannot do is notice one you never mentioned.

If a step was skipped, the status is "done except X", never "done".

## State protocol

- `PROJECT.md`: mutable. Current increment, open gate, next action, done /
  in-flight / blocked, and the honest-accounting block (trust line + residuals).
- `log.md`: append-only. `## [YYYY-MM-DD] phase | event`. Never edit a past line.

[If the project already keeps a backlog, roadmap, or per-feature summary docs,
name them here as the source of truth. `PROJECT.md` points at them and does not
copy them.]

After any meaningful step, update both, so a **zero-context agent can resume from
these two files alone.** Cite commit SHAs and run IDs so any finding is traceable
to the run that produced it. A conclusion whose provenance you cannot reconstruct
is a rumor.

## Honest accounting

Label every claim **built** or **assumed**. Carry `Honest scope:` and `Honest
residual:` notes for anything deferred or known-limited. Report what is built vs.
what is assumed; never blur them. Every projection carries a downside case.

## Verification commands

[The real commands, verified to run. e.g. tests, lint, typecheck, and whatever
single command runs all of them.]

## Gates (owner-only; never do these yourself)

You prepare; the owner decides and authorizes. **Approval at one gate never
extends to the next.**

- G1: [e.g. approve increment scope before build]
- G2: [e.g. any change against the production database]
- G3: [e.g. pricing, plans, or anything touching money]
- G4: [e.g. promoting to production]
- G5: [e.g. reading or exporting real customer data]

Anything touching **money, identity, brand, customer data, production, or a
published artifact** is a gate by default, listed above or not.
