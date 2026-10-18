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

A verdict here is an approving human review, or a run of the `evaluator` skill if it is installed, given at an earlier
commit than the current head. A passing CI run or a bot's approval is not one to carry over: CI must pass at the
current head. A verdict covers a patch, not a commit, so after a rebase, a force-push or the trunk merged into the
branch, compare patch ids. Fetch first (`git fetch origin`, and for a PR from a fork also
`git fetch origin pull/<number>/head`); the patch id of `<sha>` against `<base>` is the first field of:

```bash
B=$(git merge-base <base> <sha>); git -c core.quotePath=true diff-tree -p --full-index "$B" <sha> | git patch-id --verbatim
```

`git diff-tree` ignores the user's diff settings and the two options pin how paths and binary files are written, so
the id does not depend on local configuration. Only `--verbatim` keeps whitespace (the default and `--stable` strip
it), so an indentation change that alters what Python code does changes the id. If git does not know `--verbatim`,
treat the verdict as stale.

- **The verdict's id** is the one recorded with it, with its base (the evaluator prints both on its `Evaluated:`
  line). An evaluator verdict with no id (for example `patch id not computed: uncommitted changes`) is not reused. A
  human review records none: compute it from the review's commit (`commit_id` in
  `gh api repos/{owner}/{repo}/pulls/<n>/reviews`, a REST call; `gh pr view` uses GraphQL and may fail) against the
  PR's base at that time (for a stacked PR, the branch of the PR below it). A recorded id stands even if its SHA is
  gone; recompute it with the recorded base only to confirm it. No recorded id and no old SHA: the verdict is stale.
- **The current id**: `<base>` is `origin/<base>` from the dry run's `PR #<n>: <head> -> <base>` line (a dry run
  refused as stacked, draft or closed prints it too; for a promotion PR it is the target, not the trunk), or
  `origin/<default branch>` for a branch with no PR yet. `<sha>` is `git rev-parse origin/<head>` after the fetch
  (for a fork, `git rev-parse FETCH_HEAD` right after fetching `pull/<number>/head`); if it differs from the SHA after
  `--match-head-commit` in the dry run's `Would run:` line, someone pushed: run the dry run again.
- **Same id**: the verdict holds. **Different id**: the verdict is stale; see what changed with
  `git range-diff <old base>...<old sha> <base>...<sha>` (or diff the two patches), then redo the review or the
  evaluation at the current head before merging. **An empty current id** (a SHA that is not there, or no diff at all)
  means not checked, never a match.

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
