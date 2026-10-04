# The Method

A portable operating discipline for building software with AI agents.
Extracted from a production project in 2026. Project-agnostic.

---

## The one-sentence version

**An agent cannot certify its own work, so every mechanism here exists to take
that power away from it and hand it to an adversary.**

Everything below is a consequence of that sentence.

---

## Why you need this

A capable model produces artifacts that *look* finished. It writes a test that
passes, a guard that compiles, a plan that reads as rigorous. What it cannot
reliably do is notice that the test asserts its own mock, that the guard has
never once fired, or that the plan rests on a premise that was false before the
first line was written.

These are not hypotheticals. In the source project, an independent evaluator
found, in code the builder had declared complete:

- A flagship security test that was a **tautology** — it asserted the behavior of
  the mock it had just constructed.
- A module (the OAuth code exchange) with **zero test coverage**, sitting inside a
  suite reported as green.
- **Twelve distinct bypasses** of a module-boundary gate the builder believed was
  airtight, found across four adversarial rounds.
- Two design premises, load-bearing for a security model, that were **measured
  false** — after which the plan changed and the code was never written wrong.

None of these were caught by the builder. All of them would have shipped.

The tell that you need this is in your git log. If you have a commit that says a
milestone is complete, followed by a commit that fixes bugs in that milestone,
your certification step is decorative.

---

## The seven mechanisms

### 1. Contract first — written by someone who isn't building

Before implementation, write a `contract.json`: a list of numbered assertions,
each with an `id`, an `area`, a `priority` (`MUST` / `MUST-NOT` / `SHOULD`), the
`assertion` itself, and — critically — a **`verify` clause that names the
concrete evidence that would prove it**.

```json
{
  "id": "SEC-4",
  "area": "Isolation",
  "priority": "MUST",
  "assertion": "A tenant-scoped query cannot return rows belonging to another account, even if the caller controls the search_path.",
  "verify": "pgTAP: as account B's role, plant a shadow object in pg_temp that the helper would resolve; assert the helper still returns FALSE. Mutation-check: remove `SET search_path=''` and assert this test goes red."
}
```

The `verify` clause is the whole trick. An assertion without one is a wish. With
one, the assertion is a **failing test you haven't written yet**, and the build
is done when it goes green for a reason you can reproduce.

**The builder does not author the assertions they will be graded on.** Write the
contract in a separate session, from the requirements, before you have any
affection for a particular implementation.

**Version the contract, and let skeptics bump it.** In the source project the
contract went `v2 → v2.1 → v2.2`. Each bump came from an adversary finding a gap
through which a *broken build would have passed*. The contract is not sacred —
it is the second thing you attack, after the code.

Also pin, in the contract file:

- `nonGoals` — an explicit scope fence. What this build is deliberately not.
- `pinnedValues` — decisions frozen so they cannot silently drift (SLOs, caps,
  budgets, chosen vendors).
- `gradingRule` — see the next mechanism.

### 2. The evidence standard

Write this down once, in the contract, and enforce it without exception:

> An independent evaluator assumes the build is broken and must prove each MUST
> assertion PASS with concrete, reproducible evidence — a passing automated test,
> a captured trace, or a live reproduction. **Not** "code review" as standalone
> evidence. **Not** a recorded fixture where the assertion demands live behavior.
> MUST-NOT assertions must be shown absent by an *enumerable* check: registry
> membership, a grep, a module-graph gate — something that mechanically cannot
> miss.

The two clauses that do the most work are the negative ones. "I read the code and
it's correct" is the single most common way a bad build passes. "I replayed a
recorded fixture" is how you prove a system works against a world that no longer
exists.

### 3. Generator ≠ Evaluator, and they never share a context

The agent that builds does not grade. **Use a different session.** Not a
different prompt in the same chat — a different context window. The evaluator
receives:

- the relevant slice of the contract,
- the repository,
- and *nothing about how the code was built or why*.

That last exclusion is the point. An evaluator who has read the builder's
reasoning inherits the builder's blind spots. It will find the bugs the builder
was already worried about, and miss the ones the builder never conceived of.

Give the evaluator a hostile prior, explicitly: *this build is broken; your job
is to prove where.* An evaluator asked to "review" will produce a review. An
evaluator asked to break something will break it.

### 4. Convergence, not completion

"Done" is not "I finished the tasks on the list."

**Done is: an independent adversary attacked this and found nothing new, twice.**

In the source project a module was declared `CONVERGED` only after two
consecutive independent evaluator rounds — the first found three real defects,
the second returned `holds`. A gate went four rounds and surfaced twelve
bypasses before converging. The number of rounds is not something you decide in
advance; it is an output.

If your first evaluator round finds nothing, be suspicious of the evaluator, not
proud of the build.

### 5. Mutation verification — the rule that catches self-certifying tests

**For every test or guard that claims to prevent X: introduce X, watch the test
go red, then revert.**

An unmutated guard is decoration. This is the cheapest, highest-yield rule in the
entire method, and it is the one people skip.

It is how the tautological mock test was caught. It is how a SQL migration gate
was validated — by injecting a *real* vulnerability into a migration and
confirming the gate blocked the merge. A suite of 168 passing tests tells you
nothing until you know how many of them fail when the code is wrong.

Apply it to the guard, not just the feature. The question is never "does the test
pass" — it is **"can I make this test fail on purpose?"** If you can't, it isn't
testing anything.

### 6. Falsify the design premises before writing code

Load-bearing assumptions get attacked *before* implementation, not after.

The shape: fan out several independent research agents against primary sources,
then run adversarial verification lenses over what they return, then write the
plan. In the source project this ran twice and paid for itself both times:

- Three premises underpinning a database isolation model were **measured false**.
  The plan changed from a derived-column trigger to a composite foreign key —
  which makes a wrong tenancy value *unstorable*, rather than merely detected.
  The wrong code was never written.
- An OAuth flow's central mechanism (`prompt=admin_consent`) turned out to be a
  no-op for that app shape. The real anchor was the signed `id_token`. Found
  before implementation, at the cost of one research pass; found after, it would
  have been a security hole with a rebuild attached.

A premise you have not tried to falsify is not a premise. It is a hope with a
citation.

Corollary, for anything time-sensitive: **never present training-data recall as
current fact.** Verify live, cite the source with a date, and explicitly zero out
anything you cannot confirm.

### 7. Restart vs. escalate — never blind-retry

When something fails, read the trace *first*, then choose exactly one:

- **Build-mess** → the contract is right, the implementation drifted. Discard the
  mess and rebuild clean against the contract. Do not patch a patch.
- **Contract-wrong** → the implementation is honest and the contract asked for the
  wrong thing. Stop. Escalate to the human. Amend the contract, then rebuild.

The forbidden third option is running the same thing again hoping for a different
sample. If you cannot say which of the two categories you are in, you have not
read the trace.

---

## The supporting structure

### Two-file state, and an actual test that it works

- **`PROJECT.md`** — mutable. Current phase, open gate, next action, and three
  lists: done / in-flight / blocked. Overwrite it; it describes *now*.
- **`log.md`** — append-only. `## [YYYY-MM-DD] phase | event`. Never edit a past
  line.

The contract these two files satisfy: **a zero-context agent, given only these
two files, can resume the project correctly.**

That is a testable claim, so test it. Open a fresh session, point it at the two
files, ask it what to do next, and see if it's right. Do this once at the start
and you will discover immediately how much of your project's state was living
only inside a chat window.

Between sessions, **state lives in files, not in context.** Every meaningful step
ends by updating `PROJECT.md` and appending to `log.md`. That append is the
handoff.

Cite run identifiers in the state files (workflow run IDs, commit SHAs, agent
IDs) so any finding is traceable to the run that produced it. A conclusion whose
provenance you cannot reconstruct is a rumor.

### One chat, one job

- One session = one increment (build) **or** one evaluation. Never both.
- Size an increment to what an evaluator can attack in a single pass. If the
  evaluator has to hold too much, it will review instead of break.
- Sequence increments so that the highest-stakes slice — the one where being
  wrong is expensive and hard to reverse — comes early, while changing your mind
  is still cheap.

### Human gates

Enumerate up front the actions the agent prepares but never performs. Anything
touching **money, identity, brand, customer data, or a published artifact.**

The agent's job at a gate is to make the decision as easy and well-informed as
possible, and then stop. Approval granted for one gate never extends to the next.

Typical gate set (adapt it): approve scope and stack · approve the cost
commitment · connect live credentials or production · authorize a release ·
launch.

### Honest accounting

Label every claim **built** or **assumed**. The source project's `PROJECT.md`
carries explicit `Honest scope:` and `Honest residual:` notes — a load test that
was deferred, a guard whose limits are known and written down. Nobody is misled,
including the next agent to read it.

Every projection carries a downside case. A number without one is a promise, and
you are not in a position to make promises.

### Grade taste, don't vibe it

For anything subjective — UI, copy, a niche choice — use a weighted rubric:

1. A **disqualifier**, evaluated first, pass/fail.
2. Weighted criteria, each scored 0–5.
3. **Floors on the criteria that actually decide survival**, not just a total.
   Eight middling 3/5 scores sum to 60; if your bar is 65, mediocrity clears it.
   Require the two or three criteria that genuinely determine the outcome to
   independently clear a floor.
4. The total **recomputed in code**, never by the model.

Output a score *and* a paragraph. The paragraph is where the reasoning lives; the
score is what makes it comparable.

---

## Where multi-agent orchestration fits

Fan-out is an **accelerant, not the method**. Everything above works with one
model and two chat windows. Reach for orchestration at the two places where
independent perspectives genuinely beat one long chain of reasoning:

- **Before code** — parallel research against primary sources, then adversarial
  verify lenses over the findings. This is mechanism #6.
- **After build** — a panel of evaluators with *distinct lenses* (correctness,
  security, does-it-reproduce), not N identical reviewers. Diversity catches
  failure modes that redundancy cannot.

Practical notes:

- Give each verifier a different lens. Three identical skeptics is one skeptic
  with error bars.
- Prompt verifiers to **refute**, and to default to "refuted" under uncertainty.
- Any autonomous loop needs a convergence criterion — *K consecutive rounds
  finding nothing new* — or it will run until it runs out of budget.
- Record the run ID. Findings without provenance are anecdotes.
- Orchestrate at decision points. Never for mechanical edits.

---

## Adapting this

**Keep, always:** role separation · the evidence standard · convergence by
adversary · mutation verification · two-file state · human gates · honest
accounting.

**Adapt to the project:** the gate list · rubric criteria · phase names · contract
areas · increment size.

**Do not cargo-cult:** the specific phase names, the discovery rubric, or the
workflow tooling. Those are the source project's clothes, not its skeleton.

---

## The failure modes this prevents, named

So you can recognize them in the wild:

| Failure mode | What it looks like | Which mechanism kills it |
|---|---|---|
| Self-certifying test | Asserts its own mock; passes forever | #5 mutation verification |
| Guard that never fired | Compiles, deployed, has never rejected anything | #5 mutation verification |
| Coverage theater | Green suite; one file has zero tests | #3 independent evaluator |
| False-premise plan | Correct code, wrong world model | #6 falsify before code |
| Review-as-evidence | "I read it and it's correct" | #2 evidence standard |
| Fixture-as-liveness | Replays a world that changed | #2 evidence standard |
| Premature "complete" | Completion commit, then bugfix commits | #4 convergence |
| Blind retry | Same prompt, hoping for a better sample | #7 restart vs. escalate |
| Context amnesia | State lived in a chat window that closed | two-file state |
| Vibed taste | "This looks good to me" | rubrics |

---

*The method is not about being slow. It is about never being confidently wrong in
a direction that is expensive to reverse.*
