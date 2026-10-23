# Things that bit the eighth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the eighth batch (Q3 designer agent, Q8 production rules):
- The Figma connector failed a third time (the design plugin's Figma server was refused by the proxy with a 403),
  so Q3 was built on a design system in code. Check the connector before planning a Figma path.
- Nesting was on, and `eng-lead` started the builders, but the session ran them in the background again. Telling
  `eng-lead` up front to hand back at once with the agent IDs worked: the reports came to the main session, which
  started the reviewers from one contract file and sent the fix rounds.
- The Agent tool in `eng-lead`'s run had no `name` field; it put each name in the call's description. Address
  builders by agent ID.
- A standing order said "add no trailer that names a model", while the harness's attribution reminder asks for one.
  One builder followed the brief, the other the harness. Say in the standing orders which one wins.
- A prose fix cannot be proven by a test. For project-setup's introduction the control was a one-turn headless run
  that counts the tool calls before the first text block. It showed that the stronger wording did nothing, at the
  base or after the fix.
- `--setting-sources project` hides a skill installed under the empty HOME's `~/.claude/skills/`: the child said the
  skill was not installed and built its own unsafe designer. Use `--setting-sources user,project` with an empty HOME,
  or install the skill under the project's `.claude/skills/`.
- A skill's `allowed-tools` read grant is gone after `--resume` in headless runs (the fifth batch saw it too). Skills
  that span turns must read their bundled files in the first turn; launch-readiness still does not (Q11).
- In `-p`, a variadic flag such as `--allowedTools` swallows a prompt written after it. Pass the prompt on stdin or
  right after `-p`.
- A JavaScript test name in backticks that contains `${CLAUDE_SKILL_DIR}` interpolates and throws; use single quotes.
- A regex `font-family\s*:\s*(?!var\()` matches `font-family: var(--x)`, because `\s*` can match zero spaces before the
  lookahead. Put the spaces inside it: `font-family\s*:(?!\s*var\()`. The plan check caught it.
- A roster bump makes the roster test fail on the slice branch until `.claude/agents/` is updated. Merge that slice
  with `--no-commit`, copy the roster over the installed copies, run the suite, then commit, so no commit on the
  first-parent line is red.
- The project-setup eval's `experienced-dev.md` persona describes a TypeScript kanban board; on another fixture it
  stopped the setup as "wrong directory". Give each fixture a persona that matches it.
