# planning

Skills that turn an idea into decided, sliced work, and shape the code before and while it is written. Every skill
is listed in [docs/REFERENCE.md](../../docs/REFERENCE.md#planning).

## The lazy-senior hook

`hooks/planning/lazy-senior.mjs` adds the text of `lazy-senior/RULES.md` as start-up context at every session start
(startup, resume, clear, compact) and every subagent start. It is on by default and has no options. Turn it off with
`"hooks": {"lazy-senior": false}` in `~/.claude/pau-skills.json` or the project's `.claude/pau-skills.json`, or for
one session with `PAU_SKILLS_DISABLE=lazy-senior`. The `lazy-senior` skill works the same without it. See
[hooks/README.md](../../hooks/README.md).
