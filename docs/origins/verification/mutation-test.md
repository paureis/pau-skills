# mutation-test and `skills/verification/mutation-test/mutate.sh` (Original)

Back to the [origins index](../../ORIGINS.md).

Merged from two harnesses I wrote in two projects.

**Problem.** "Mutation-verify every guard" was a rule, and doing it by hand kept lying in three ways. A restore with
`git checkout --` erased uncommitted work in the mutated file. On a Windows checkout, `sed -i` rewrote CRLF line
endings even when the expression matched nothing, so git reported the file modified and a no-op mutation read as
SURVIVED. And a mutation that applied but did not change behaviour (one that only appended `and true` to a SQL join)
looked like a weak test. The harness asserts each step instead of trusting it.

**What came from where.** From the first harness: the mutation on stdin as a sed script or a unified diff, the
control run, the check that a patch touches only the target file, exit codes 0/1/2, and restoring only the target
file. From the second: the content-hash "applied" check with carriage returns stripped, the label, and printing the
changed lines on SURVIVED. New here: `--sed` as an argument, running from any directory inside the repository,
refusing untracked files, and BSD `sed` support for macOS.

**Later changes (2026-10-17).** Ideas from pstack, no shared text (0 of 1,358 word 6-grams): the two-edit check in
`skills/principle-test-behavior-not-implementation/SKILL.md`, and backlog decision 1. `mutate.sh` gained `--refactor`,
the second edit: a pure refactor must leave the command green (KEPT, exit 0; BROKE, exit 1, with the changed lines;
exit 2 as before), with the same dirty-tree, control, applied, one-file and restore checks. The skill now prefers a
real past mistake as the mutation: find the fix commit with `git log --grep`, `-S` or `-G`, and feed it reversed with
`git show -R --format= --no-color <sha> -- <file>`. The harness refuses an edit that deletes or empties the file, which
a reversed commit that added or renamed it produces; a review found that such a patch read as CAUGHT. BROKE says to
read the failure first, since a build error means the refactor was wrong. The skill says paths are relative to the
repository root, how to keep one bug's hunks, how to handle a fix spread over several files and runner caches, and
when a runtime error counts as a catch.

**Later changes (2026-10-19).** Two cases where the harness trusted file times. With Python, a same-size mutation
written in the same second as the control's bytecode read SURVIVED (13 of 15 back-to-back runs in the fourth batch's
dry run): the harness now runs its commands with `PYTHONDONTWRITEBYTECODE=1` and a throwaway `PYTHONPYCACHEPREFIX`.
And `git checkout` skips a file whose size and time match what the index recorded, so a command that set a fixed
time left the mutant in place behind a false RESTORED: the restore now checks out, compares content with
`git cat-file --filters`, and deletes and checks out again only when the content still differs; it refuses at the
start a file with an edit git does not see, a skip-worktree or assume-unchanged file, and an absolute or `..` path, and
reports a command that staged or committed the mutant. A review of the first fix found it could erase such hidden
edits and delete files on the error paths; the fix round closed both.
