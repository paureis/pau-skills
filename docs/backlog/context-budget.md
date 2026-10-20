# Context budget

[Back to the backlog index](../BACKLOG.md)

Facts (Claude Code documentation, skills page, checked 2026-10-17):
- The skill listing gets about 1% of the context window: about 2,000 tokens, roughly 8,000 characters, on a 200k
  window. Each description is capped at 1,536 characters. When the listing is over budget, Claude Code drops the
  descriptions of the least used skills; their names stay.
- `disable-model-invocation: true` removes the description from the model's context. The skill then costs nothing
  until the user types `/name`, and the model cannot start it on its own.
- On 2026-10-17 the 25 skills here were all model-invocable and their descriptions totalled about 15,000
  characters, already over the budget of a 200k window.

**Policy since P0.5** (decision 7; this replaces the two tiers of decision 4).
- Every skill is model-invocable. No skill sets `disable-model-invocation`; `tests/context-budget.test.mjs` fails on
  it.
- Each description is a trigger list: one sentence on what the skill does, then the phrases a person would say, and
  what makes it different where another installed skill could be picked. At most 400 characters each and 14,000 in
  total (the owner runs a 1M window with `SLASH_COMMAND_TOOL_CHAR_BUDGET` at 80000; raised from 12,000 for the fifth
  batch and to 14,000 for the sixth, by the owner's choice).
- Skills that launch subagents or headless runs, commit, push or install with no other check, or change how the whole
  session works carry the confirm paragraph word for word, unless something in them already stops for the user's yes
  before that cost. `CONFIRM_LIST` in `tests/confirm-step.test.mjs` is the list (13 skills), and the README and
  `which-skill` must name the same skills. In those skills' descriptions only phrases that ask for the work are
  quoted; remarks and questions are written as situations.
- A skill starts another one directly ("use `x` if it is installed") for a step inside the work the user asked for,
  and offers it ("offer to run `x` if it is installed") for a next step or while the current skill is read-only.
- After each upload, a new session measures the listing with `/context`, and asks "List every skill in your skill
  listing that has no description"; the answer should be none.
- The listing's budget is 1% of the context window unless `SLASH_COMMAND_TOOL_CHAR_BUDGET` (characters) raises it.
  The owner sets it to 80000 on each computer and in the default cloud environment (see `docs/INSTALL.md`).
