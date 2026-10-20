# Test-tamper guard, `hooks/verification/test-tamper-guard.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** When the goal is a green suite, the cheapest edit is to the test: skip it, mark it as an expected
failure, or delete the assertion that fails. The suite goes green and the bug ships. Skipping is sometimes right, so
the hook asks the user instead of refusing, and it compares before and after so only what the edit adds is flagged.

**Changes for this release.** None; written for this release.
