# File-size guard, `hooks/guards/file-size-guard.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Agents read big files in pieces and pay for every token, and they keep appending to the file they already
have open. The guard refuses a Write or Edit that leaves a file in the project over its token limit (bytes / 4, 5,000
by default) and larger than it was, and gives a recipe for splitting that kind of file. When splitting is not part of
the task, the message tells the agent to ask the user instead of starting a large refactor. Lockfiles, notebooks,
minified, binary, generated, vendored and git-ignored files are skipped. `tests/file-size.test.mjs` applies the same
rule to every tracked file, so CI catches a change made outside Claude Code.

**Where the idea came from.** A post by Matt Pocock on X (2026-10-18) suggesting a pre-commit hook that refuses files
over 5,000 tokens (bytes / 4), runs only on staged files, ignores files agents do not write, and gives instructions on
how to split in its message. No text is shared; this version is a Claude Code hook, measures the change before it is
written, and adds the per-kind recipes, the skip rules and the repository test.

**Changes for this release.** None; written for this release (Q4 in `docs/backlog/q4.md`).
