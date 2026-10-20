# Compact-snapshot hook, `hooks/session-discipline/compact-snapshot.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Compaction keeps the gist and drops the specifics: the user's exact words, the files already changed,
the open todo items. The agent resumes confident and slightly wrong. The hook writes those facts to a git-ignored
file before compaction and prints them when the compacted session starts, which is the moment they are needed.

**Changes for this release.** None; written for this release.
