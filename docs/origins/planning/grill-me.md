# grill-me (Adapted from [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me))

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
- It keeps one question at a time.
- With only a goal and no plan, it suggests running `/brainstorm` first; without it, it asks for two or three ways to
  reach the goal before grilling one, and grills the user's idea if they decline.
- It asks each question with the session's question tool when it has one, recommended answer first. With three or
  more decisions open at once it offers one `html-plan` page to answer them together, as its own question first, if
  it is installed; the page's answers feed the next branch, never a build.

**Why.** The short version stopped early and ended without a record of what was decided.
