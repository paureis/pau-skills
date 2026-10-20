# retrospective (Original)

Back to the [origins index](../../ORIGINS.md).

0 of 1198 word 6-grams appear in any upstream version, including upstream's later `retro` skill.

**Problem.** Retrospectives kept adding rules, and the rule files kept growing by restating themselves: the same lesson
written three ways in three places, until nobody read them. The skill's redundancy gate makes every proposed learning
pay for its place: score it against everything already written, and if it is a duplicate, the answer is to make the
existing rule enforceable, not to restate it. The scoring started as 3-shingle Jaccard; a control run scored a rule
that was already present nearly verbatim at 0.058, because a short proposal against a long unit is dominated by the
unit's size. It switched to bigram containment (intersection over the smaller set), which answers "how much of the new
text is already there". `--stale` was added after rules kept pointing at files and scripts that had been removed.

**Changes for this release.** The script's path is `${CLAUDE_PLUGIN_ROOT}`-relative; it also scans the project's
`.claude/skills`; `--home` lets tests point it at a fake home; the stale-path pattern covers common top-level folders
instead of one project's; dated "owner rule" notes were removed; one bullet was added to "Fixes in the rule itself"
(the third-time rule from `RULES.md`).

**Later changes (2026-10-18).** Ideas from pstack's `reflect` (`references/synthesizer.md`,
`references/divergent-reviewer.md`), in new words (0 of 1,670 word 6-grams of the SKILL.md after the first pass appear
in reflect's `SKILL.md`, `synthesizer.md` or `divergent-reviewer.md`): a decision-changing gate before the audit
search (a row that adds text must change what a future agent does; a user correction always goes on to the search),
a lens for decisions that were right for the wrong reason, the learning beneath the obvious one, one piece of evidence
per row, approval row by row, only the user's own corrections count, a route that enforces a DUPLICATE, and a route
for a skill that did not start (its description, edited at its source within its limits). A cold run showed the audit
could not see short CLAUDE.md bullets or skills synced from claude.ai. Since the fifth batch, `--check` scores a
bullet of 12 or fewer content words with a word score (a candidate the agent confirms by reading the bullet; bullets
of one or two content words are still read by hand) and reads synced skills, printed with their path, which stay out
of the pairs report.
