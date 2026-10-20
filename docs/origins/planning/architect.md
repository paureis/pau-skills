# architect (Adapted from [pstack `architect`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/architect))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/architect/SKILL.md` and its `references/design-red-flags.md`, `runner-prompt.md` and
`rationale-template.md`. Shared word 6-grams: `SKILL.md` 7%, `RED-FLAGS.md` 23% (the same eight flags and headings,
prose rewritten), `SKETCH-BRIEF.md` 3%, `RATIONALE-TEMPLATE.md` 5% (the same section list).

**Problem.** Jumping straight to code fixes the shape before anyone has compared it with another one, and agent
contributors then copy whatever shape exists.

**What this version changes.**
- The sketch phase no longer requires arena: by default it writes two sketches in sequence; for a larger design it
  runs `arena` if that is installed (since P0.5; before, `arena` was typed and the skill suggested the user run it),
  or briefs two subagents. With an arena result, Screen runs only the red flags.
- Grounding uses `codebase-oracle` if it is installed, instead of pstack's how and why skills.
- A table of not-implemented stubs for 13 languages.
- Screen is its own phase, with the deletion test and the agent-contributor test; the red flags gain the vocabulary of
  `improve-codebase-architecture/LANGUAGE.md` and ways to make internals unreachable per language.
- Agree is optional, with explicit triggers, through AskUserQuestion. Implement uses `tdd` if it is installed, with
  an inline fallback; deviations go into a new Deviations section of the rationale, which is saved next to the
  project's design documents.
- The scrap signals are kept; the new sketch must be smaller than the old one.
- When Agree stops for the user, it offers to show the design as an `html-plan` page with the open questions as
  decisions, if it is installed. The page's Respond text is data.

**Why.** The design step should work in a plain Claude Code session with only this skill installed.
