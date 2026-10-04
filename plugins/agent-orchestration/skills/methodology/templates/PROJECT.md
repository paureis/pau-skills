<!-- MUTABLE. Overwrite freely — this describes NOW, not history.
     History goes in log.md and is never edited.

     The contract this file satisfies: a zero-context agent, given only
     PROJECT.md and log.md, can resume this project correctly. Test that claim
     for real, in a fresh session, at least once. -->

# [Project] — Status

**Current phase:** [phase name]
**Open gate:** [which owner decision is blocking, or "none"]
**Next action (resume here):** [the single next thing, concrete enough to act on
without reading anything else. If it needs the owner, say so and say what for.]

**Contract:** `[path]` v[N] — [X assertions: Y MUST / Z MUST-NOT / W SHOULD]
[What hardened it to this version, and what that skeptic caught.]

## Done

- [Increment / phase] — **CONVERGED** after [N] independent evaluator rounds.
  [What the evaluator found and how it was fixed. Commit SHA. Run ID.]
  **Honest scope:** [what this does NOT cover. Be specific — this is the note
  that stops a future reader from over-trusting the work.]

## In-flight

- [Increment] — [state]. Evaluator [agent ID] is attacking it now; converge only
  after it reports.
  **Honest residual:** [what is known-deferred and why]

## Blocked / needs owner

- **[Gate]** — [what you have prepared; what decision you need; what it costs.]

## Gate status

- G1 [name] — PASSED [date] / OPEN / pending
- G2 [name] — ...
