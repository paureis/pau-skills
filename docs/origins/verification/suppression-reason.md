# Suppression-reason hook, `hooks/verification/suppression-reason.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

An idea from pstack `agents/comment-sicko.md`, which names three suppressions "and similar"; no shared text.

**Problem.** When a linter or type checker complains, the cheapest edit is to silence it, and a bare suppression hides
both the warning and why it does not apply. The hook reports, through `additionalContext` only, an edit to a code file
that raises the count of suppressions with no reason, in about a dozen languages. It never blocks or approves. What
counts as a reason (free text in the tool's own syntax, or a comment on the line above) is this hook's own criterion. A
review found false reports on comments that named a directive and on string literals, a missed Vue case and a path
filter that skipped whole projects; all were fixed test first before the release.

**Changes for this release.** None; written for this release.
