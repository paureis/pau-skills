# Destructive guard, `hooks/guards/destructive-guard.mjs` and `hooks/lib/shell.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Each command it blocks has a well-known story: `rm -rf "$DIR/"` with an empty variable, a force push
over shared history, `git reset --hard` over hours of uncommitted work, `git clean` on files git never stored. The
guard checks git state only when it matters, so ordinary cleanup on a clean tree still passes. `shell.mjs` splits a
command line into simple commands, including `sh -c` payloads, so guards can tell which program a flag belongs to.

**Changes for this release.** None; written for this release.
