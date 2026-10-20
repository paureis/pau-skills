# Roadmap hook, `hooks/session-discipline/roadmap.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** The roadmap is the only order of work: one item at a time, the next one starts only when the previous one
meets its definition of done, and blocked items are marked and skipped. Sessions that started from memory of the last
session drifted from that order. The hook prints the current item, the next pending one, the blocked ones and the open
questions at session start, so the order is in context before the first message.

**Changes for this release.** The original parsed fixed headers in another language and fixed paths. This version
reads paths, table headers, the status column name, status words and the "answered" pattern from
`.claude/roadmap.json`, finds columns by header name, and prints nothing when the project has no roadmap. The pure
`summarize()` function is exported for tests.
