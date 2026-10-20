# rule-to-hook (Original; since 2026-10-17 adapted in part from [pstack `correct`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct))

Back to the [origins index](../../ORIGINS.md).

Closest upstream for the 2026-10-17 changes: `skills/correct/SKILL.md`, with the idea in
`docs/guide/09-make-it-yours.md`. `SKILL.md` shares about 0.7% of its word 6-grams with `correct` (29 of 4,403); the
structure taken is `correct`'s fix order (architecture, types, a lint or CI check whose error names what to use
instead, a test, prose last), the ratchet ("fail only when a change adds more"), proving each check on a real past
mistake, exceptions on the offending line with a reason, an expiry and a human's approval, the rule table, and the
reply line on why a higher layer did not work. `agent-friendly-audit` was adapted from the same skill and finds the
rules; this skill implements one, with the same fix order and exception fields. `templates/ratchet.mjs` and the rest
of the skill are mine.

**Problem.** Rules written in CLAUDE.md, AGENTS.md or a style guide get broken again and again while they are still
written down, and rewriting the sentence does not help. When someone finally turns a rule into a hook, they often
guess at the hook contract, block harmless near-misses until the guard gets switched off, crash closed on unexpected
input, or ship a test that has never been seen to fail. The skill makes the conversion a repeatable process: real
examples first, a deliberate choice of mechanism, a pure decision function with a DENY/PASS test table, a proof that
the test can fail, a live check, and a pointer from the rule to what now enforces it.

**Changes for this release.** None; written for this release.

**What this version changes (2026-10-17, from pstack `correct`).**
- Step 2 tries the layers in order before picking a mechanism: architecture (make the rule unnecessary), types, a lint
  or CI check, a test, prose. A Claude Code hook is the layer for rules about what the agent does; a rule about the
  code goes in its own lint, types or tests, with a hook at most as a second layer. `correct` has no hook layer; it was
  written for Cursor.
- Every hook reason, lint message and CI error names what to use instead, with the message settings of ESLint, Ruff,
  Clippy and golangci-lint `forbidigo`. A linter rule that parses the code is preferred over a regex.
- A pattern already common gets a ratchet: ESLint bulk suppressions, `ruff check --add-noqa`, golangci-lint
  `--new-from-*`, or the new `templates/ratchet.mjs` (Node 20+, any language's files). It runs from the repository
  root, counts matching lines in files chosen by git globs (`:(exclude)` for a file that is allowed), compares the
  count with a committed baseline number, fails when a change adds one, asks for the baseline to be lowered when it
  drops, refuses globs that match nothing, and lists every exception on each run for review.
- Exceptions go on the offending line with a reason, an expiry date and an approver recorded by role or handle; the
  check fails on an expired or incomplete one (`ratchet.mjs` does). A script cannot tell who wrote the approval, so
  code review is the human gate.
- Each layer has its own test, proof and record: architecture and types prove with the case that no longer builds and
  get no row; a ratchet has a table of lines that must and must not count plus the baseline cases.
- Step 4 puts the file from before a real past fix into today's tree (`git show <sha>^:<path> > <path>`), runs the
  check, and restores it, besides the mutation. `correct` asks for the past mistake; the mutation stays from the
  earlier version.
- Step 5 adds a CI live check for lint, CI and test enforcers, and a rule table pairing each rule with its enforcer and
  exceptions. `correct` drops a rule once its mistake cannot happen, and the earlier version never deleted it: now the
  sentence stays while an enforcer exists and goes only when architecture or types make the mistake impossible.
- The report gains a Layer line with why each higher layer did not work, a Ratchet line and a Past mistake line.

**Why.** Backlog item M2. A hook enforces nothing for humans and CI, so a code rule enforced only by a hook was a weak
default, and a rule that already had hundreds of live instances could not be enforced at all without a ratchet. The
review and a cold run on a Python fixture found that `ratchet.mjs` run from a subfolder would ask for the real baseline
to be lowered to the subfolder's count, that a glob matching nothing gave a check that could never fail, and that a
permanently allowed file could not be left out; all three are fixed and tested.
