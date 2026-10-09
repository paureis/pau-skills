---
name: safe-merge
description: Merge a GitHub pull request without closing the pull requests stacked on it, by merging without branch deletion and deleting the head branch only if no open PR uses it as its base. Use whenever a PR is to be merged with gh, when the merge guard denied a gh pr merge, or when the user says "merge PR", "merge this", "land it", "merge the stack".
argument-hint: "<pr number> [--dry-run]"
---

# Safe merge

`gh pr merge` is denied by this plugin's merge guard. Merge with the script instead:

```bash
node "${CLAUDE_SKILL_DIR}/safe-merge.mjs" <number> --dry-run   # reads only: prints what it would do
node "${CLAUDE_SKILL_DIR}/safe-merge.mjs" <number>
```

Always run the dry run first and show its output to the user. Merging is an outward-facing action: get the user's go
ahead for this specific PR before the real run, unless they already gave it for this PR.

## What the script checks

1. The repository and the active gh account (printed; refused if `SAFE_MERGE_REPO` is set and differs).
2. The PR is open, not a draft, and its base is the trunk (the repository's default branch, or `SAFE_MERGE_TRUNK`),
   or one of the head->base pairs in `SAFE_MERGE_PROMOTIONS` (for example `develop->main`). A PR based on another
   PR's branch is refused with the steps to retarget it.
3. It merges pinned to the head commit it read (`--match-head-commit`), so a push in between cannot slip in.
4. Afterwards it deletes the remote head branch only if no open PR uses it as its base, it is not protected, and the PR
   does not come from a fork. Otherwise it prints the next step for each stacked PR.

## Exit codes

0 done; 1 the merge failed (nothing deleted); 2 usage; 3 refused before merging; 4 merged, but the branch could not be
deleted or the decision could not be made. The output always contains a `MERGED: yes` or `MERGED: no` line; never
re-run a merge after `MERGED: yes`.

## Stacked PRs, in one paragraph

When B is based on A's branch: merge A with this script (A's branch survives because B uses it), then
`gh pr edit <B> --base <trunk>`, bring the trunk into B's branch, and close and reopen B so CI runs (retargeting does
not trigger it). When B merges, A's branch is no longer anyone's base and the next merge deletes it.
