# Branch-context hook, `hooks/session-discipline/branch-context.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Agents assume a clean tree on a feature branch. They commit onto the default branch, build on a branch
that is far behind its upstream, or start new work in the middle of an unfinished rebase. All of it is visible with
a few read-only git commands that nobody runs first, so the hook runs them at session start.

**Changes for this release.** None; written for this release.
