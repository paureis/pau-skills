# Prove the test can fail

Names and `${CLAUDE_SKILL_DIR}` mean what SKILL.md says: `${CLAUDE_SKILL_DIR}` is this folder.

- **Hook, lint rule with its own code, CI script:** the decision function, as below.
- **Ratchet:** the comparison (in `ratchet.mjs`, `count > base` to `count > base + 1`) or the pattern (a regex that
  no longer matches the violation), and see the baseline cases from step 3 fail. With a linter's own baseline
  (ESLint suppressions, Ruff `noqa`), there is no code of yours to break: add one instance to a scratch copy and see
  it fail.
- **Architecture or types:** nothing to mutate. The proof is the step 3 case that no longer builds, or the old way
  that no longer exists. Skip to the past mistake.

Any mutation, on the guard or on whichever file you break:

1. **Commit** the guard and its test first (or, if the user does not want a commit yet, copy the guard to a scratch
   file to restore from). Restoring with `git checkout --` erases uncommitted work, and does nothing on an untracked
   file, so a mutation applied to an uncommitted file can silently stick.
2. **Apply one mutation and assert it applied**, by reading the content, not by trusting the edit command: for
   example change `return why` to `return null` in `check()`, then `grep -n "return null" <guard>` to see it.
3. **Run the tests and expect red.** Every DENY case should fail. If the suite stays green, the test does not exercise
   the decision function; fix the test, not the mutation.
4. **Restore and assert clean**: `git checkout -- <guard>` (or copy the scratch file back), then
   `git diff --exit-code -- <guard>` must print nothing, and the tests must be green again.

These steps work by hand. If the `mutation-test` skill is also installed, its `mutate.sh` automates them, with each
step checked by the script; its usage is at the top of the file. With any pau-skills plugin the path is
`${CLAUDE_PLUGIN_ROOT}/skills/verification/mutation-test/mutate.sh` (every plugin ships the whole repository); with
the skill installed on its own, it is in that skill's folder.

Then the real past mistake, when step 1 found a commit that fixed a violation. With a clean tree, put the version
of that one file from before the fix into the current tree, `git show <sha>^:<path> > <path>`, run the check (or
the build, for a type fix), see it fail with its message naming what to use instead, then restore with
`git checkout -- <path>` (or delete the file if it no longer exists) and check that `git diff --exit-code` prints
nothing. One file in today's tree keeps git, today's baseline and today's configuration in place; a whole old tree
(`git archive <sha>^ | tar -x -C <tmp>`) suits only a check that needs none of them, such as a linter run on a
folder, because it is not a git repository and the old tree's count is not today's. With no fixed violation in
history, say "no past mistake" in the report; the mutation (or, for architecture and types, the case that no longer
builds) is then the only proof.
