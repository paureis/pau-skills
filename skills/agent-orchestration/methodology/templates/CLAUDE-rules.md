<!-- Merge this into the project's CLAUDE.md. Keep the project's existing
     architecture rules; this adds an operating discipline, it does not
     replace a design. Fill every [bracket]. -->

# Operating Rules

Read `PROJECT.md` and `log.md` before acting. `METHODOLOGY.md` defines every term
below; when in doubt, it wins over your default reading of the word.

## Hard constraints (never violate)

- [Domain constraints: what this product is and is not]
- [Budget ceiling, if any. Verify every tool's price live before recommending it.]
- **Recency:** cite live sources with dates. Never present training-data recall as
  current fact. Explicitly zero anything you cannot verify live.
- [Any non-negotiable architecture decisions, and why]

## Roles are separated

- **Generators** produce. They do **not** grade their own work, and they do not
  author the assertions they will be graded on.
- **Evaluators** assume the deliverable is broken and prove where. Fresh session,
  hostile prior, no access to how the thing was built.
- Never build and evaluate in the same context window.

## Contract first

Before implementation, a `contract.json` of numbered assertions, each with a
`verify` clause naming concrete reproducible evidence.

**Evidence standard (the grading rule):** a passing automated test, a captured
trace, or a live reproduction. **Not** code review as standalone evidence. **Not**
a recorded fixture where the assertion demands live behavior. `MUST-NOT`
assertions must be shown absent by an enumerable check: enum/registry
membership, grep, or a module-graph gate.

## Mutation verification

For every test or guard claiming to prevent X: introduce X, watch it go red,
revert. **An unmutated guard is decoration.** A test that cannot fail is a defect,
and it is reported as one.

## Convergence, not completion

Done means an independent evaluator attacked it and found nothing new, **twice**.
Not "the task list is empty." Never write a completion note in the session that
did the work.

## Falsify premises before code

Load-bearing assumptions get attacked against primary sources *before*
implementation. A premise you have not tried to falsify is a hope with a citation.

## Restart vs. escalate: never blind-retry

On failure, read the trace first, then choose one:

- **build-mess** → rebuild clean against the contract.
- **contract-wrong** → stop, escalate to the owner, amend the contract.

Running the same thing again hoping for a different sample is forbidden.

## State protocol

- `PROJECT.md`: mutable. Current phase, open gate, next action, done / in-flight
  / blocked.
- `log.md`: append-only. `## [YYYY-MM-DD] phase | event`.

After any meaningful step, update both, so a **zero-context agent can resume from
these two files alone.** Cite run IDs, agent IDs, and commit SHAs so every finding
is traceable to the run that produced it.

## Honest accounting

Label every claim **built** or **assumed**. Carry `Honest scope:` and `Honest
residual:` notes for anything deferred or known-limited. Every projection carries
a downside case. Report what is built vs. what is assumed; never blur them.

## Gates (owner-only; never do these yourself)

You prepare; the owner decides and authorizes. Approval at one gate never extends
to the next.

- G1: [e.g. approve scope + stack]
- G2: [e.g. authorize spend / cloud costs]
- G3: [e.g. connect live credentials or production]
- G4: [e.g. access real customer data]
- G5: [e.g. sign and publish a release]

Anything touching **money, identity, brand, customer data, or a published
artifact** is a gate by default, listed above or not.
