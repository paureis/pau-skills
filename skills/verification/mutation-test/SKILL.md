---
name: mutation-test
description: Prove that a test or guard can fail, by introducing the exact defect it claims to catch, running it, and restoring the file, with the three steps that silently lie (the mutation applied, behaviour changed, the restore worked) asserted by a script. Use when the user says "mutation test", "mutate this", "can this test fail", "prove the test catches it", "is this guard real", after writing a test for a bug or a security rule, or before reporting a guard as working.
argument-hint: "<file> <test command>"
---

# Mutation test

A green test proves nothing until you have watched it go red for the defect it claims to catch. An unmutated guard is
decoration. Use the harness for every hand mutation; do not mutate by hand with `sed` and `git checkout`.

Harness: `bash "${CLAUDE_PLUGIN_ROOT}/skills/verification/mutation-test/mutate.sh"`. On Windows run it from Git Bash.

## Steps

1. **Commit first.** The harness refuses a dirty tree, because restoring the file erases any uncommitted edit in it.
2. **Choose the defect the test claims to catch**, the one a real regression would introduce: drop the tenant filter,
   invert the permission check, remove the `await`, return early. Not a random edit: a mutation that breaks the
   build or crashes the import proves only that the file is imported.
3. **Write the mutation** as a sed expression (one substitution) or a unified diff touching only that file.
4. **Run it** with the narrowest command that should catch it:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/skills/verification/mutation-test/mutate.sh" --label no-tenant-filter \
     --sed 's/r.tenantId === page.tenantId/true/' src/server/status.ts npx vitest run tests/status.test.ts
   # or, with a unified diff you wrote to a scratch file:
   bash "${CLAUDE_PLUGIN_ROOT}/skills/verification/mutation-test/mutate.sh" src/server/status.ts npm test < /tmp/m.patch
   ```

5. **Read the result.**
   - `CAUGHT` (exit 0): the test detects the defect. Record the mutation and the result next to the test or in the
     report.
   - `SURVIVED` (exit 1): read the printed changed lines first. If the mutation really changes behaviour, the test is
     weak: fix the test, then run the same mutation again. If it does not (it applied but is equivalent), choose a
     different mutation.
   - Exit 2: the harness could not do its job (dirty tree, the control run failed, the mutation did not apply, the
     restore failed). Nothing was proven either way; fix the cause and run it again.

## Rules

- One mutation per run, and one file per mutation.
- A `CAUGHT` from a command that failed for an unrelated reason (a syntax error, a missing import) is not a catch.
  Look at the failing assertion in the output.
- Report the mutation as "applied, caught, restored" only from the harness output, never from memory.
