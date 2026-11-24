# instructions-audit and `scan.mjs` (Original; one paragraph of `CHECKS.md` adapted from mattpocock/skills `writing-for-agents`)

Back to the [origins index](../../ORIGINS.md).

Named `claude-md-audit` until 2026-10-17; claude.ai refuses skill names that contain "claude".

**Problem.** Instruction files such as CLAUDE.md and AGENTS.md grow by accretion: rules are restated in new words,
paths and commands go stale after refactors, and different files or tools end up contradicting each other. Every
always-loaded line costs tokens in every session, and vague or contradictory rules get ignored, which pushes people to
add louder rules instead of fewer, better ones. Nothing measured the whole set or checked it against the repository
as it is now.

**Changes for this release.** None; written for this release.

**Q30 (2026-11-24).** From mattpocock/skills `writing-for-agents` at abeeaf9 (MIT), its "Context pointers" and "The
two loads". The "Relevance and cost" part of `CHECKS.md` now weighs context load (tokens and attention in every
session) against cognitive load (someone must know the material exists and when it is needed). A pointer's wording, not
its target, decides when the agent reads it, so a needed doc behind a vague pointer is a finding: sharpen the pointer
first, inline only if that fails. Deleting with no pointer is only for material nobody needs. 5 of 98 new word 6-grams
are upstream text, all from that one sentence, so `CHECKS.md` is listed in `NOTICE` and the frontmatter names the
upstream.
