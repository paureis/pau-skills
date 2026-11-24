# to-issues (Adapted from [`to-tickets`](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/engineering/to-tickets), formerly `to-issues` upstream)

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/engineering/to-issues`, 2026-06-03 to 2026-07-06, and the earlier `prd-to-issues`
(2026-02-25) for the AFK/HITL split. About 19% of my 6-grams are upstream text; the rest is rewritten.

**What this version changes.**
- Tracker-agnostic: no setup skill and no triage labels; issues can be files.
- It keeps the AFK/HITL slice types, which later upstream versions dropped.
- An explicit vertical-versus-horizontal example.
- The approval list shows title, type, dependencies and scope.
- The issue template gains "Slice Type" and "Notes" fields.
- A Rules section: vertical not horizontal, use the domain vocabulary, each slice independently testable, dependency
  order, and a size guide (3 to 8 slices for a typical feature; past 12 is too thin or the feature should split).
- Removed: upstream's prefactoring step and its quiz questions.

**Why.** I use it across projects with different trackers, and without a size guide it over-sliced.

**Q30 (2026-11-24).** From upstream `to-tickets` at abeeaf9. A wide refactor (one mechanical change whose callers span
the codebase) is the exception to vertical slices and is sliced as expand and contract: expand, then batches of callers
each blocked by the expand, then a contract blocked by every batch. When the batches cannot stay green alone, they share
an integration branch that blocks a last issue that integrates and verifies. Each issue fits one fresh context window.
Step 4 uses the tracker's own blocking link where it has one, writes "Blocked by" otherwise and always for files, and
names the frontier after creating the issues. Step 1 reads the domain glossary (`GLOSSARY.md`, upstream's new name, or
`CONTEXT.md`) and the ADRs. Not taken: the setup skill, triage labels, the `.scratch/` layout, the quiz, the
prefactoring step. 1 of 367 new word 6-grams are upstream text. The `upstream:` link is pinned to abeeaf9.
