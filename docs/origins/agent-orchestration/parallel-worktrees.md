# parallel-worktrees and `worktrees.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** When several agents work on one repository at once, they often share a single checkout: one agent's
`git add -A` commits another's half-finished edit, and a branch switch or formatter run rewrites files mid-task. Even
with separate checkouts, pieces that quietly touch the same files, lockfiles or migration numbers leave conflicts that
someone resolves later with less context. Merging every branch and testing once at the end then hides which pair of
changes broke the build.

**Changes for this release.** None; written for this release.

**Later changes (2026-10-18).** Ideas from pstack `swarm` (a race with the selection rule declared up front),
`principle-separate-before-serializing-shared-state` (instructions are not concurrency control) and the
worktree-cleanup playbook (an audit's bucket is advice, not permission), in new words: a race shape that always asks
for its N-times cost unless the user asked for a race, with its own rules in every phase; what worktrees do not
separate (ports, databases, caches, the integration branch, tags and remotes), checked after each agent; and before
removing a worktree, a check that no agent, editor or watcher still uses it.
