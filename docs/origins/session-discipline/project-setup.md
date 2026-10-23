# project-setup (Original)

Back to the [origins index](../../ORIGINS.md).

Written for this release. It shares no text with any upstream version.

**Problem.** People who already use Claude in the browser want to try Claude Code on a real project, and the first
session goes badly in predictable ways: they do not know what to ask, they are surprised by what it changes, and
the next session has forgotten how they wanted to work. `/init` writes a CLAUDE.md from the code alone, so it cannot
record what only the person knows: how much they want explained, how much freedom Claude gets, what "done" means,
and what must never happen. This skill asks for exactly those things, one question at a time, and skips anything
the files already answer.

**Changes for this release.** None; written for this release. Design decisions: it stands alone (no other skill or
plugin needed) and finds its bundled files through `${CLAUDE_SKILL_DIR}`, so it also works when copied into
`~/.claude/skills/` on its own. Its writing rules are a relaxed form of ASD-STE100 Simplified Technical English:
short sentences, active voice and fixed terms, without the controlled vocabulary. It changes no settings files and
writes each file only after the person approves the exact text. The claims about Claude Code in `GUIDE.md` were
checked against the documentation in October 2026. `evals/project-setup/` runs it against three simulated users and
grades the transcripts.

**Batch 8 (2026-10-23).** Q8 production rules: a new question offers the rules from `PRODUCTION-RULES.md` (a copy of
the one in `launch-readiness`) whose signal the project shows, so the gaps agents leave most often are written down
before the first line of code. It still stands alone: the file is in its own folder.
