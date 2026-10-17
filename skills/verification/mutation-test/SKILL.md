---
name: mutation-test
description: "Prove a test or guard can fail by introducing the exact defect it claims to catch, running it and restoring the file, with a script checking each step. Use after writing a test for a bug or a security rule, before reporting a guard as working, or when the user says 'mutation test', 'can this test fail', 'prove the test catches it', 'is this guard real'."
argument-hint: "[--refactor] <file> <test command>"
---

# Mutation test

A green test proves nothing until you have watched it go red for the defect it claims to catch. An unmutated guard is
decoration. Use the harness for every hand mutation; do not mutate by hand with `sed` and `git checkout`.

Harness: `bash "${CLAUDE_SKILL_DIR}/mutate.sh"`. On Windows run it from Git Bash.

## Steps

1. **Commit first.** The harness refuses a dirty tree, because restoring the file erases any uncommitted edit in it.
   Caches the test run leaves behind (`__pycache__`, `.pytest_cache`, coverage files) count as dirty on the next run:
   add them to `.gitignore`.
2. **Choose the defect the test claims to catch**, the one a real regression would introduce: drop the tenant filter,
   invert the permission check, remove the `await`, return early. Not a random edit: a mutation that breaks the
   build or crashes the import proves only that the file is imported.
   **Prefer a real past mistake** when the history has one: the bug this test was written for, or an earlier fix in
   the same code. It is a defect someone actually made, not one you imagined. To find one:
   - `git log --no-merges --oneline -i -E --grep='fix|revert|regress' -- <file>` lists the fix commits on the file;
   - `git log --no-merges --oneline -S '<code>' -- <file>` (or `-G '<regex>'`) finds the commits that added or
     removed a pattern, such as the check the test guards.
   Reversing that commit's change to the file is the mutation (step 4). If the commit fixed several things, keep only
   the hunks of the one bug, or write that one change as a sed expression instead.
3. **Write the mutation** as a sed expression (one substitution) or a unified diff touching only that file.
4. **Run it** with the narrowest command that should catch it:

   ```bash
   bash "${CLAUDE_SKILL_DIR}/mutate.sh" --label no-tenant-filter \
     --sed 's/r.tenantId === page.tenantId/true/' src/server/status.ts npx vitest run tests/status.test.ts
   # or, with a unified diff you wrote to a scratch file:
   bash "${CLAUDE_SKILL_DIR}/mutate.sh" src/server/status.ts npm test < /tmp/m.patch
   # or, a real past fix undone (git show -R prints the fix backwards):
   git show -R --format= --no-color <sha> -- src/server/status.ts \
     | bash "${CLAUDE_SKILL_DIR}/mutate.sh" --label undo-<sha> src/server/status.ts npm test
   ```

   For a past fix, `--format=` matters: plain `git show` output starts with `commit ...` and is not read as a patch.
   `git diff -R <sha>^ <sha> -- <file>` prints the same thing. Give `<file>` exactly as git prints it, relative to
   the repository root with no `./`, because the harness compares the two paths. A merge commit prints `diff --cc`,
   which the harness rejects; use the commit on the branch instead. If the reversed hunk no longer applies to the
   current code (exit 2, "the patch did not apply"), the code has moved on: write the same defect by hand.

5. **Read the result.**
   - `CAUGHT` (exit 0): the test detects the defect. Record the mutation and the result next to the test or in the
     report.
   - `SURVIVED` (exit 1): read the printed changed lines first. If the mutation really changes behaviour, the test is
     weak: fix the test, then run the same mutation again. If it does not (it applied but is equivalent), choose a
     different mutation.
   - Exit 2: the harness could not do its job (dirty tree, the control run failed, the mutation did not apply, the
     restore failed). Nothing was proven either way; fix the cause and run it again.

## Second check: a pure refactor stays green (optional)

A test that catches the defect can still be a bad test if it is pinned to the internals: it breaks on every
refactor and catches no extra bug. To check that, make a pure refactor of the code under test (rename a private
helper, inline a variable, reorder independent statements, swap `a === b` for `b === a`) and run it in refactor
mode. Every step is the same as for a mutation (commit first, control run, applied check, one file, restore); only
the expected outcome is reversed:

```bash
# rename a private helper everywhere in its file; a test that imports it will break
bash "${CLAUDE_SKILL_DIR}/mutate.sh" --refactor --label rename-helper \
  --sed 's/_line_total/_item_cost/g' src/cart.py pytest tests/test_cart.py
```

- `KEPT` (exit 0): the command still passes after the refactor. The test does not depend on what you changed,
  provided it runs that code at all (a `CAUGHT` for a mutation in the same lines shows it does).
- `BROKE` (exit 1): the command failed. Read the printed changed lines. If the edit really kept every observable
  result the same, the test is coupled to the internals: rewrite it against the public interface. If the edit changed
  behaviour after all, it was not a pure refactor; choose another.
- Exit 2: as for a mutation, nothing was checked.

A refactor is limited to one file, like a mutation, so one that moves code into a new module or across files cannot
be checked this way. Check it by hand: commit first, make the refactor, run the test, then restore with
`git checkout -- <files>` and confirm `git status` is clean.

## Rules

- One mutation (or refactor) per run, and one file per run.
- A `CAUGHT` from a command that failed for an unrelated reason (a syntax error, a missing import) is not a catch.
  Look at the failing assertion in the output.
- Report the mutation as "applied, caught, restored" only from the harness output, never from memory.
