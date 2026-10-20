# Merge guard and safe merge, `hooks/guards/merge-guard.mjs`, `skills/guards/safe-merge/safe-merge.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** With stacked pull requests, deleting the branch of a merged PR makes GitHub close every PR based on it.
`gh pr merge -d` closed two stacked PRs that way. The guard denies every raw `gh pr merge` (it denies too much on
purpose, never too little), and the merge goes through a script that merges pinned to the head commit it read, without
deletion, and deletes the branch afterwards only if no open PR uses it as its base.

**Changes for this release.** The original hard-coded one repository and its two long-lived branches. This version
reads the trunk from the repository's default branch, with environment variables for an expected repository,
promotion pairs (`develop->main`), protected branches and the merge method; it is translated, and the guard's message
prints the script's real path.

**Later changes (2026-10-18).** An idea from pstack's `skills/poteto-mode/playbooks/shipping.md` ("a verdict covers a
patch"), in new words (0 of 520 word 6-grams in upstream): before merging on an older review or evaluator verdict,
compare the patch id (`git -c core.quotePath=true diff-tree -p --full-index` piped to `git patch-id --verbatim`) of the
verdict against the current head's; a different or missing id means the verdict is redone. A review and a cold run
found that `--stable` ignores indentation, that abbreviated blob ids made binary patches differ between clones,
and that promotion and stacked PRs need their own base.
