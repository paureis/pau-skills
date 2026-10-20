# Secret guard, `hooks/guards/secret-guard.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** An agent handed a key to get something working pastes it where it is used. From there it reaches a
commit, and a pushed key has to be rotated even after the commit is reverted. The guard checks the text being written,
by known token formats and by random-looking literals assigned to secret names, and leaves `.env` files alone.

**Changes for this release.** None; written for this release.
