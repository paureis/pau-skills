# grill-me (Adapted from [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me), [`grilling` and `to-questionnaire`](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/productivity))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: the 7-line version of 2026-03-26 to 2026-04-28. Upstream has since turned `grill-me` into a pointer
to a new `grilling` skill that asks questions in rounds.

**What this version changes.**
- A description with trigger phrases.
- The single paragraph is restructured into rules.
- "Explore instead of asking" now says what *is* worth asking: intent, priorities, tradeoffs and preferences.
- "Be relentless: don't stop early to be polite or to save time."
- A "When it's done" section: no unresolved branches, "could you hand the plan to someone else", and a summary of the
  decisions for the user to confirm.
- With only a goal and no plan, it suggests running `/brainstorm` first; without it, it asks for two or three ways to
  reach the goal before grilling one, and grills the user's idea if they decline.
- It asks each question with the session's question tool when it has one, recommended answer first. With three or
  more decisions open at once it offers one `html-plan` page to answer them together, as its own question first, if
  it is installed; the page's answers feed the next branch, never a build.

**Why.** The short version stopped early and ended without a record of what was decided.

**Q30 (2026-11-24).** From upstream `grilling` and `to-questionnaire` at abeeaf9 (MIT). It now asks in rounds: each
round is the frontier, every decision whose prerequisites are settled, and a question that depends on another in the
same round waits. Plain-text rounds are numbered and worded so "yes" accepts the recommendation; in the question tool
the recommended option goes first. A long fact search may go to the built-in read-only Explore subagent in the
background while the independent questions are asked. A decision the user cannot answer can become
`questionnaire-<topic>.md` for the person who can. It is done when the frontier is empty. Not taken: the emoji round
format, the questionnaire's three-step interview, template and file prefix. 10 of 472 new word 6-grams are shared with
`grilling` and 5 of 472 with `to-questionnaire`; the frontmatter pins both.
