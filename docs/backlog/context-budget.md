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

- Checked 2026-11-24 (Q28): on claude.ai a typed `/name` starts a flagged skill and a request in words gets "Couldn't
  load skill"; headless, `claude -p "/name args"` starts one on Claude Code 2.1.331 and the Skill tool refuses it
  from words. `claude plugin validate` accepts any frontmatter key, so it proves nothing about the flag.

**Policy since Q28** (decision 32; it replaces the policy of decision 7, called "Policy since P0.5" before).
- Most skills are model-invocable. A skill is typed only (`disable-model-invocation: true`) when the owner always
  starts it on purpose and no other skill starts it. `TYPED_ONLY` in `tests/typed-only-list.mjs` is the list (8
  skills), and the tests fail when a frontmatter flag and the list differ. A typed-only skill costs no context until
  the user types `/name`, and nothing else can start it.
- Each model-invoked description is a trigger list: one sentence on what the skill does, then the phrases a person
  would say, and what makes it different where another installed skill could be picked. At most 400 characters each
  and 14,000 in total, counting model-invoked descriptions only (the owner runs a 1M window with
  `SLASH_COMMAND_TOOL_CHAR_BUDGET` at 80000). A typed-only description is one sentence for the `/` menu, at most 160
  characters, with no "Use ..." opener and no quoted phrase.
- Skills that can start on their own and launch subagents or headless runs, commit, push or install with no other
  check, or change how the whole session works carry the confirm paragraph word for word, unless something in them
  already stops for the user's yes before that cost. `CONFIRM_LIST` in `tests/confirm-list.mjs` is the list (9
  skills); a typed-only skill is never on it. The README and `which-skill` name the same skills, and each also names
  exactly the typed-only skills. In confirm-list descriptions only phrases that ask for the work are quoted; remarks
  and questions are written as situations.
- Every description is one double-quoted line in printable ASCII only (the space to the tilde), with no backtick. A
  model-invoked one has exactly one "Use ..." opener; a typed-only one has none. On a confirm-list skill no quoted
  phrase holds a question mark or has one right after it. `tests/description-rules.test.mjs` checks these rules.
- A skill starts a model-invoked skill directly ("use `x` if it is installed") for a step inside the work the user
  asked for, and offers it ("offer to run `x` if it is installed") for a next step or while the current skill is
  read-only. No skill starts a typed-only skill: a mention of one says what the user can type (`/x`), and only where
  keeping `x` typed only is right. `tests/typed-only.test.mjs` checks it.
- Typed-only skills have no request list in `evals/triggers/requests/`, and no near miss expects one.
- After each upload, a new session measures the listing with `/context`, and asks "List every skill in your skill
  listing that has no description"; the answer should be none, and no typed-only skill should be listed.
- The listing's budget is 1% of the context window unless `SLASH_COMMAND_TOOL_CHAR_BUDGET` (characters) raises it.
  The owner sets it to 80000 on each computer and in the default cloud environment (see `docs/INSTALL.md`).
