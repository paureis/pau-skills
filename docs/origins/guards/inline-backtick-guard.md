# Inline-backtick guard, `hooks/guards/block-inline-backtick-payload.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Backticks inside a double-quoted bash string are command substitution: `` node -e "...`x`..." `` runs `x`
and splices its empty output into the script. The rule against it was written down with five recorded instances and
was broken a sixth time while writing a retrospective about following rules. Four of the six had printed a success
line and left a file quietly wrong. By the third-time rule, it became a PreToolUse guard.

It is tuned against false positives, because a gate that cries wolf gets ignored: it blocked its own commit (a
`printf` whose prose mentioned `node -e`), which exposed two flaws, now fixed and tested: it must match the interpreter
at a command position only, and backticks inside single quotes are literal. A later miss added the case where single
quotes nested inside a double-quoted payload protect nothing.

**Changes for this release.** ESM with an exported `findBacktickPayload()`; the test uses the plugin path instead of
an absolute one; test labels no longer carry dates or private words. The 16 original cases are all kept, plus one for
other tools and malformed input.
