# Compact-snapshot hook, `hooks/session-discipline/compact-snapshot.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Compaction keeps the gist and drops the specifics: the user's exact words, the files already changed,
the open todo items. The agent resumes confident and slightly wrong. The hook writes those facts to a git-ignored
file before compaction and prints them when the compacted session starts, which is the moment they are needed.

**Changes for this release.** None; written for this release.

**Q38 item 5 (decision 35).** With auto compaction at 40% the context meter no longer says when to stop, so the hook
counts compact_boundary lines and, from the second compaction, tells the session to hand off. Probes on 2.1.332, manual
and auto, found the new boundary is not on disk yet when SessionStart compact fires, so PreCompact stores the count.
