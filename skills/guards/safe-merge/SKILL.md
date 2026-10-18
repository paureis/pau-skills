---
name: safe-merge
description: "Merge a GitHub pull request without closing the pull requests stacked on it, by merging without branch deletion and deleting the head branch only if no open PR uses it as its base. Use whenever a PR is to be merged with gh, when the merge guard denied a gh pr merge, or when the user says 'merge PR', 'merge this', 'land it', 'merge the stack'."
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

## Before merging on an older verdict

A verdict here is an approving human review or an evaluator run given at an earlier commit than the head the dry run
prints. A passing CI run or a bot's approval is not one to carry over: CI must pass at the current head. A verdict
covers a patch, not a commit, so after a rebase, a force-push or the trunk merged into the branch, compare the patch,
not the commit hash. Fetch first (`git fetch origin`, and for a PR from a fork also
`git fetch origin pull/<number>/head`), then run:

```bash
B=$(git merge-base <base> <sha>); git diff-tree -p "$B" <sha> | git patch-id --verbatim
```

The id is the first field of the output. `git diff-tree` ignores the user's diff settings, so the id is the same on
every machine. `--verbatim` matters: `--stable` ignores whitespace, so an indentation change that alters what Python
code does would keep the same id. If git does not know `--verbatim`, treat the verdict as stale.

- **At verdict time**, `<base>` is the PR's base branch then (for a stacked PR, the branch of the PR below it) and
  `<sha>` the commit reviewed. Record the id with the verdict, in the review comment or the evaluator's output: after
  a force-push the old SHA may not exist locally.
- **Now**, `<base>` is `origin/<trunk>`, with the trunk the dry run prints on its `Destination:` line (do not detect
  it again with `gh repo view` or another GraphQL call, which may fail), and `<sha>` is the head after
  `--match-head-commit` in the dry run's `Would run:` line.
- **Same id**: the rebase or trunk merge did not change the change, and the verdict holds. **Different id**: the
  verdict is stale; redo the review or the evaluation at the current head before merging. **An empty id** (a SHA that
  is not there, or no diff at all) means not checked, never a match.

The id stays the same across a rebase onto unrelated commits or one that shifts line numbers, the trunk merged into
the branch, a message-only amend and squashing the branch's commits. It changes on any edit to the change, and also
when a trunk edit lands within 3 lines of a hunk, because context lines are hashed; that errs toward stale.

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
