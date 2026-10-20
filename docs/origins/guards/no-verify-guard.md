# No-verify guard, `hooks/guards/no-verify-guard.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** When a pre-commit hook fails, the shortest path to a commit is `--no-verify`, and the failed hook was
the useful signal. The guard covers the flag, its short form inside option groups, and the environment variables and
config overrides that do the same thing, while understanding quoted commit messages.

**Changes for this release.** None; written for this release.
