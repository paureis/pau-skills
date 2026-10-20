# Verify-before-done hook, `hooks/verification/verify-before-done.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** A report of "done" after edits that were never run is the most common false claim an agent makes, and a
rule that says "run the tests first" is skipped exactly when the agent feels sure. The hook reads the transcript, not
the summary: edits since the user's last message with no check after the last one send the agent back, once.

**Changes for this release.** None; written for this release.
