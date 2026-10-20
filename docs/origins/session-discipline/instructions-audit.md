# instructions-audit and `scan.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

Named `claude-md-audit` until 2026-10-17; claude.ai refuses skill names that contain "claude".

**Problem.** Instruction files such as CLAUDE.md and AGENTS.md grow by accretion: rules are restated in new words,
paths and commands go stale after refactors, and different files or tools end up contradicting each other. Every
always-loaded line costs tokens in every session, and vague or contradictory rules get ignored, which pushes people to
add louder rules instead of fewer, better ones. Nothing measured the whole set or checked it against the repository
as it is now.

**Changes for this release.** None; written for this release.
