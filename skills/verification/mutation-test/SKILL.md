---
name: mutation-test
description: "Prove a test or guard can fail: introduce the exact defect it claims to catch, run it, then restore the file. Use after writing a test for a bug or a security rule, or when the user says 'mutation test', 'can this test fail', 'is this test any good', 'could this test catch a bug', 'prove the test catches it', 'is this guard real'."
argument-hint: "[--refactor] <file> <test command>"
---

# Mutation test

A green test proves nothing until you have watched it go red for the defect it claims to catch. An unmutated guard is
decoration. Use the harness for every hand mutation. Edit and restore by hand (`sed`, then `git checkout`) only
where the harness cannot run, such as an edit across several files, and then follow its steps yourself.

Harness: `bash "${CLAUDE_SKILL_DIR}/mutate.sh"`. On Windows run it from Git Bash. `<file>` is relative to the
repository root, and the command runs from the root whatever folder you start in. Run the `git` commands below from
the root too (or write the path as `:/<path>`): from a subfolder, a root-relative path matches nothing and the
harness reports that the mutation arrived empty.

## Steps

1. **Commit first.** The harness refuses a dirty tree, because restoring the file erases any uncommitted edit in it.
   Caches the test run leaves behind (`__pycache__`, `.pytest_cache`, coverage files) count as dirty on the next run:
   add them to `.gitignore`. A runner that caches results may skip the run: turn that off (Go: `go test -count=1`).
2. **Choose the defect the test claims to catch**, the one a real regression would introduce: drop the tenant filter,
   invert the permission check, remove the `await`, return early. Not a random edit: a mutation that breaks the
   build or crashes the import proves only that the file is imported.
   **Prefer a real past mistake** when the history has one: the bug this test was written for, or an earlier fix in
   the same code. It is a defect someone actually made, not one you imagined. To find one:
   - `git log --no-merges --oneline -i -E --grep='fix|revert|regress' -- <file>` lists the fix commits on the file;
   - `git log --no-merges --oneline -S '<code>' -- <file>` (or `-G '<regex>'`) finds the commits that added or
     removed a pattern, such as the check the test guards.
   Reversing that commit's change to the file is the mutation (step 4). Skip commits that added or renamed the file:
   reversed, they delete it, and the harness refuses that. If the commit fixed several things, keep only the hunks
   of the one bug: save the `git show -R` output to a file, delete the other hunks (each starts at a `@@` line; keep
   the header lines above the first one), and feed the file on stdin. Or write that one change as a sed expression.
   When the fix touches several files, one file's half of it can read `CAUGHT` while it recreates a different bug:
   write the original defect as one change in one file, or check it by hand.
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
refactor and catches no extra bug. To check that, make a pure refactor of the code under test and run it in refactor
mode. Choose the refactor that targets the coupling you suspect: rename the helper the test imports, replace the
collaborator it mocks with an equivalent call, reorder the calls whose order it asserts, rename the private field it
reads. An edit the test cannot notice (swapping `a == b` for `b == a`) always reads `KEPT` and says nothing.
Run the tests that cover the file (its test file or the whole suite), not only the newest test. Every step is the
same as for a mutation (commit first, control run, applied check, one file, restore); only the expected outcome is
reversed:

```bash
# rename a helper that only this file uses (grep for it first: in Go, a C# partial class or a reopened Ruby class,
# other files can use it too, and the rename breaks the build instead of testing the test)
bash "${CLAUDE_SKILL_DIR}/mutate.sh" --refactor --label rename-helper \
  --sed 's/_line_total/_item_cost/g' src/cart.py pytest tests/
```

- `KEPT` (exit 0): the command still passes after the refactor. The test does not depend on what you changed,
  provided it runs that code at all (a `CAUGHT` for a mutation in the same lines shows it does). `KEPT` is only as
  good as the edit: one that quietly changes untested behaviour also reads `KEPT`, so confirm from the printed lines
  that the edit is pure.
- `BROKE` (exit 1): the command failed. Read the failure first: a build error, a syntax error or a missing import
  means the refactor was wrong, not the test (the same rule as a `CAUGHT` from an unrelated failure); choose another
  refactor. On a failing assertion, read the printed changed lines. If the edit really kept every observable result
  the same, the test is coupled to the internals: rewrite it against the public interface. If the edit changed
  behaviour after all, it was not a pure refactor; choose another.
- Exit 2: as for a mutation, nothing was checked.

A refactor is limited to one file, like a mutation, so one that moves code into a new module or across files cannot
be checked this way. Check it by hand: commit first, make the refactor, run the test, then restore with
`git checkout -- <files>` and confirm `git status` is clean.

## Rules

- One mutation (or refactor) per run, and one file per run.
- A `CAUGHT` from a command that failed for an unrelated reason (a syntax error, a missing import, a build error) is
  not a catch. Look at the failing assertion in the output.
- A runtime error (a panic, an uncaught exception) counts as a catch only when it is the failure the bug report
  describes. Otherwise choose a mutation that a test assertion catches.
- Report the mutation as "applied, caught, restored" only from the harness output, never from memory.
