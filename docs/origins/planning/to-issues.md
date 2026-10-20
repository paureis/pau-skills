# to-issues (Adapted from [`to-issues`](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-tickets), now `to-tickets` upstream)

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
