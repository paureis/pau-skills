# to-prd (Adapted from [`to-spec`](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/engineering/to-spec), formerly `to-prd` upstream)

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/engineering/to-prd`, 2026-04-17 to 2026-04-28 (about half of my 6-grams).

**What this version changes.**
- It saves the PRD as a markdown file and offers to submit it to whatever tracker the project uses, instead of always
  creating a GitHub issue.
- User stories must cover edge cases and error states.
- Out of scope "be explicit; this prevents scope creep".
- A Rules section: no interviewing (run a grilling skill first), flag shallow modules, no file paths or code snippets,
  exhaustive stories ("if you can think of 10, write 20", including accessibility).
- The template's XML tags became headings, and the banking example was removed.
- After saving, it offers to render the spec as an `html-plan` page with its open decisions, if it is installed. The
  markdown PRD stays the spec; the page's answers update it, never start a build.
- Step 2 no longer checks the modules and their tests with the user, which went against the skill's no-interview
  rule. The PRD lists them from what the conversation decided, and the message after saving names any choice the
  conversation did not settle, for the user to correct.

**Why.** Not every project tracks work in GitHub issues, and the first drafts it produced were thin on unhappy paths.

**Q30 (2026-11-24).** From upstream `to-spec` at abeeaf9. Implementation Decisions allows a snippet a prototype
produced (state machine, reducer, schema, type shape), inlined in its decision, trimmed to the part that decides and
marked as from a prototype; the Rules bullet names the exception. Step 1 uses the glossary words (`GLOSSARY.md` or
`CONTEXT.md`) and respects the ADRs. Not taken: the seam sketch and its check with the user (they contradict the
no-interview rule), publishing with a triage label, the user-story example. 16 of 109 new word 6-grams are upstream
text, most of them from the snippet exception, worded as `to-issues` already had it. The `upstream:` link is pinned to
abeeaf9.
