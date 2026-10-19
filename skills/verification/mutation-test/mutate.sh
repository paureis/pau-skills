#!/usr/bin/env bash
# Mutation harness: prove a test can FAIL by breaking the code it guards, then restore. One hand mutation per run,
# with every step that has silently lied before asserted by the script instead of from memory.
#
# Usage, from anywhere inside a git repository, with the mutation on standard input:
#   mutate.sh [--label <name>] <file> <command...> < mutation.sed
#   mutate.sh [--label <name>] <file> <command...> < mutation.patch
#   mutate.sh [--label <name>] --sed '<expression>' <file> <command...>
#   mutate.sh --refactor [--label <name>] [--sed '<expression>'] <file> <command...>
# <file> is relative to the repository root; the command runs from the repository root.
# The mutation is a unified diff (if it starts with "diff" or "---", applied with `git apply --ignore-whitespace`) or a
# sed script. Examples:
#   echo 's/=== tenantId/!== tenantId/' | mutate.sh src/repo.ts npx vitest run tests/repo.test.ts
#   mutate.sh --label no-auth --sed 's/requireAuth(req)/true/' src/api.ts npm test
#   git show -R --format= --no-color <sha> -- src/repo.ts | mutate.sh src/repo.ts npm test   (undo a real past fix)
#
# Steps, and why each one exists:
#  1. Refuses to run on a dirty tree: restoring with `git checkout -- <file>` erases every uncommitted change in that
#     file, so a mutation on top of uncommitted work loses the work (this has happened). Commit first. <file> must also
#     hold its committed content BY CONTENT (git status trusts a size and time that match the index, and hid a
#     same-size edit that the restore then erased), must not be marked skip-worktree or assume-unchanged (git ignores
#     their local edits), and must be a path relative to the root without `..` (git is asked for it by that name).
#  2. Runs the command once WITHOUT the mutation (the control) and exits 2 if it fails: without it, a mistyped command
#     (exit 127) or a missing test file would count as a caught mutation.
#     Before it, Python's bytecode cache is turned off for the command: PYTHONDONTWRITEBYTECODE=1 whatever the caller
#     set, and PYTHONPYCACHEPREFIX pointed at an empty folder removed on exit. Python checks a .pyc against the
#     source's time in whole seconds and its size, so the control's .pyc of the original matched a same-size mutant
#     written in the same second and the original ran instead: a false SURVIVED (13 of 15 back-to-back runs), or a
#     false KEPT with --refactor. The prefix also stops Python reading a .pyc left by the user's own earlier run, and
#     no __pycache__ is written in the repository. Only the harness's child commands see either variable.
#  3. Assertion one, the mutation APPLIED: for a patch, `git apply --numstat` must show it touches only <file> (the
#     restore only restores that file); after applying, <file> must differ BY CONTENT with carriage returns stripped,
#     not by `git status` (on a Windows checkout `sed -i` rewrites CRLF line endings even when nothing matched, and git
#     then reports the file modified, which made a no-op mutation read as SURVIVED).
#  4. Prints the changed lines (`git diff -U0`), runs the command and keeps its exit code. Assertion two, behaviour
#     CHANGED: the control passed, so a failure now is the mutation being caught. On SURVIVED the changed lines are
#     printed again: a mutation can apply without changing behaviour (one that only appended "and true" to a SQL join
#     read as a weak test), so read them before believing a SURVIVED.
#  5. Assertion three, the restore WORKED: restores ONLY <file> and checks that file has no diff and no status (not the
#     whole tree: the command may leave untracked outputs such as snapshots or reports). git checkout skips a file whose
#     size and modification time match what the index recorded, even when its content differs (a command that sets a
#     fixed time, a patch that keeps the inode), so the check compares content, and a file git skipped is deleted and
#     checked out again. The delete comes only after a git checkout that worked: a failed one (a stale index.lock)
#     deleted a file the mutation never touched, and the first checkout replaces a parent folder that the command
#     turned into a symlink, so the delete cannot reach outside the repository. The index entry and HEAD must also be
#     what they were at the start: a command that staged or committed the mutant makes the restore write it back.
# Exit: 0 CAUGHT (the command failed with the mutation), 1 SURVIVED (the command passed: the test cannot fail that
# way, fix the test), 2 the harness could not do its job (usage, dirty tree, control failed, mutation did not apply,
# restore failed).
#
# --refactor turns the check around, for the second edit of the two-edit test: the edit is a pure refactor of the
# internals and the command is expected to STAY GREEN. Every step above is the same; only the verdict flips.
# Exit: 0 KEPT (the command still passes after the refactor), 1 BROKE (the command failed: the test is coupled to the
# internals, or the edit was not a pure refactor, or it broke the build; the changed lines are printed), 2 as above.
set -u

usage() { echo "Usage: mutate.sh [--refactor] [--label <name>] [--sed '<expression>'] <file> <command...>   (edit on stdin unless --sed)" >&2; exit 2; }

label=""
sed_expr=""
refactor=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --label) [ "$#" -ge 2 ] || usage; label="$2"; shift 2 ;;
    --sed) [ "$#" -ge 2 ] || usage; sed_expr="$2"; shift 2 ;;
    --refactor) refactor=1; shift ;;
    --help|-h) usage ;;
    *) break ;;
  esac
done
[ "$#" -ge 2 ] || usage
file="$1"
shift
tag="${label:+[$label] }"
# What the edit is called in the output, and the word for a run that could not check anything.
what="mutation"; stop="NOT MUTATED"
if [ -n "$refactor" ]; then what="refactor"; stop="NOT REFACTORED"; fi

root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "${tag}${stop}: not inside a git repository." >&2; exit 2; }
cd "$root" || exit 2

case "$file" in
  /* | [A-Za-z]:[\\/]* | .. | ../* | */.. | */../*)
    echo "${tag}${stop}: give $file relative to the repository root, without .. (the restore names the file to git by that path)." >&2
    exit 2 ;;
esac
if [ ! -f "$file" ]; then
  echo "${tag}${stop}: $file does not exist (paths are relative to the repository root)." >&2
  exit 2
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "${tag}${stop}: the tree has uncommitted changes (the restore would erase those in $file). Commit first:" >&2
  git status --short >&2
  exit 2
fi
if ! git ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
  echo "${tag}${stop}: $file is not tracked by git, so it cannot be restored." >&2
  exit 2
fi
# git status hides the local edits of a file marked skip-worktree (S) or assume-unchanged (lowercase), and the restore
# would erase them; a skip-worktree file cannot even be checked out again.
flag="$(git --literal-pathspecs ls-files -v -- "$file" | head -n 1 | cut -c1)"
case "$flag" in
  H) ;;
  S) echo "${tag}${stop}: $file is marked skip-worktree, so git hides its local edits and the restore would erase them. Clear the mark (git update-index --no-skip-worktree -- <file>) and commit first." >&2; exit 2 ;;
  [a-z]) echo "${tag}${stop}: $file is marked assume-unchanged, so git hides its local edits and the restore would erase them. Clear the mark (git update-index --no-assume-unchanged -- <file>) and commit first." >&2; exit 2 ;;
  *) echo "${tag}${stop}: $file is not in a plain committed state in the index (git ls-files -v shows '$flag')." >&2; exit 2 ;;
esac
q="$(printf '%q' "$file")"

mutation="$(mktemp)" || { echo "${tag}${stop}: could not make a temporary file." >&2; exit 2; }
expected="$(mktemp)" || { rm -f "$mutation"; echo "${tag}${stop}: could not make a temporary file." >&2; exit 2; }
pycache="$(mktemp -d)" || { rm -f "$mutation" "$expected"; echo "${tag}${stop}: could not make a temporary folder." >&2; exit 2; }
trap 'rm -f "$mutation" "$expected"; rm -rf "$pycache"' EXIT

# True when <file> holds blob $1: the bytes checkout writes for it (`git cat-file --filters` applies the same smudge
# filter and line-ending conversion), or what `git add` would store (`git hash-object`, which covers a file checked
# out before core.autocrlf changed). hash-object alone is not enough: it converts CRLF to LF even for a file committed
# with CRLF, which checkout leaves alone under core.autocrlf. A symlink holds its target's name. A file tracked with
# Git LFS is compared by its real content when git-lfs is installed; with no LFS filter configured at all, the pointer
# is the content (committed and checked out as it is) and reads as restored; with the filter configured and git-lfs
# missing, git cannot convert the file and the harness stops before the control (exit 2).
matches() {
  if [ -L "$file" ]; then
    [ "$(readlink -- "$file")" = "$(git cat-file blob "$1")" ]
    return
  fi
  [ -f "$file" ] || return 1
  if git cat-file --filters --path="$file" "$1" > "$expected" 2>/dev/null && cmp -s -- "$expected" "$file"; then return 0; fi
  [ "$(git hash-object -- "$file" 2>/dev/null)" = "$1" ]
}
start_head="$(git rev-parse -q --verify HEAD)"
start_blob="$(git rev-parse -q --verify ":$file")"
if [ ! -L "$file" ] && ! git cat-file --filters --path="$file" "$start_blob" > "$expected" 2>/dev/null; then
  echo "${tag}${stop}: git cannot turn the committed $file into its checked-out form (a filter such as Git LFS failed or is not installed), so the restore could not be checked." >&2
  exit 2
fi
if [ -z "$start_head" ] || [ -z "$start_blob" ] || ! matches "$start_blob"; then
  echo "${tag}${stop}: $file differs from the committed content, but git status does not show it (its size and modification time match what git recorded, so git did not read it). The restore would erase the change. Run: touch -- $q (git then reads it), and commit first." >&2
  exit 2
fi
export PYTHONDONTWRITEBYTECODE=1
export PYTHONPYCACHEPREFIX="$pycache"
if [ -n "$sed_expr" ]; then
  printf '%s\n' "$sed_expr" > "$mutation"
else
  cat > "$mutation"
fi
if [ ! -s "$mutation" ]; then
  echo "${tag}${stop}: the $what (patch or sed) arrived empty." >&2
  exit 2
fi

echo "=== ${tag}CONTROL (without the $what): $*"
"$@"
control=$?
if [ "$control" -ne 0 ]; then
  echo "${tag}${stop}: the command fails without the $what (exit $control): its result with the $what would prove nothing." >&2
  exit 2
fi

content_hash() { tr -d '\r' < "$1" | git hash-object --stdin; }
# Puts the committed content of <file> back. When git checkout skipped the file (its size and time match the index),
# the file is deleted and checked out again: git always writes a missing file from the index, through any filter and
# line-ending conversion, with the index's mode. Only after a checkout that worked (see step 5).
restore() {
  git checkout -- "$file" || return 1
  matches "$start_blob" && return 0
  if [ ! -d "$file" ] || [ -L "$file" ]; then rm -f -- "$file" || return 1; fi
  git checkout -- "$file"
}
# $1 is set on the restores before the command ran: the file may hold no edit at all.
restore_failed() {
  state="the file is missing or still holds the $what"
  if [ -n "${1:-}" ]; then state="the restore failed, so check what the file holds"; fi
  echo "${tag}ERROR: restoring $file did not work: $state. Fix the cause (for example remove $(git rev-parse --git-path index.lock), left by an interrupted git command), then run: rm -f -- $q && git checkout -- $q" >&2
  git status --short -- "$file" >&2
  exit 2
}
before="$(content_hash "$file")"
if head -c 4 "$mutation" | grep -qE '^(diff|---)'; then
  touched="$(git apply --numstat "$mutation" 2>/dev/null | awk '{print $3}')"
  if [ "$touched" != "$file" ]; then
    echo "${tag}${stop}: the patch must touch only $file and it touches: ${touched:-nothing it can parse}" >&2
    exit 2
  fi
  git apply --ignore-whitespace "$mutation" || { echo "${tag}${stop}: the patch did not apply." >&2; restore || restore_failed early; exit 2; }
else
  # GNU sed takes -i alone; BSD sed (macOS) needs an explicit, empty backup suffix.
  if sed --version >/dev/null 2>&1; then inplace=(-i); else inplace=(-i ''); fi
  sed "${inplace[@]}" -f "$mutation" "$file" || { echo "${tag}${stop}: sed failed." >&2; restore || restore_failed early; exit 2; }
fi
# A deleted or emptied file fails any command (a missing module, an empty import), so its CAUGHT would prove nothing.
# Reversing the commit that added or renamed the file gives exactly that patch.
if [ ! -f "$file" ]; then
  echo "${tag}${stop}: the $what deletes $file (a reversed commit that added or renamed it?): a missing file proves nothing." >&2
  restore || restore_failed early
  exit 2
fi
if [ ! -s "$file" ]; then
  echo "${tag}${stop}: the $what leaves $file empty: an empty file proves nothing." >&2
  restore || restore_failed early
  exit 2
fi
after="$(content_hash "$file")"
if [ "$before" = "$after" ]; then
  echo "${tag}${stop}: the $what did not change the content of $file (does the pattern match?)." >&2
  restore || restore_failed early
  exit 2
fi

changed_lines() {
  diff -U0 <(git show "HEAD:./$file" | tr -d '\r') <(tr -d '\r' < "$file") | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | cut -c1-160
}
if [ -n "$refactor" ]; then echo "=== ${tag}REFACTOR APPLIED to $file:"; else echo "=== ${tag}MUTATION APPLIED to $file:"; fi
changed_lines

echo "=== ${tag}COMMAND: $*"
"$@"
code=$?
# Kept for the verdicts that need them read before believing them: SURVIVED, and BROKE in refactor mode.
verdict_lines="$(changed_lines)"

restore || restore_failed
end_head="$(git rev-parse -q --verify HEAD)"
if [ "$end_head" != "$start_head" ] || [ "$(git rev-parse -q --verify ":$file")" != "$start_blob" ]; then
  echo "${tag}ERROR: the command changed what git holds for $file (it staged or committed it, so the restore wrote that back; HEAD was $start_head, now ${end_head:-none}). To get the starting content back: rm -f -- $q && git checkout $start_head -- $q (and see git log --oneline $start_head..HEAD for any commit the command made)." >&2
  git status --short -- "$file" >&2
  exit 2
fi
# By content against the blob <file> held at the start; git diff and git status also catch a mode change.
if ! matches "$start_blob" || ! git diff --quiet -- "$file" || [ -n "$(git status --porcelain -- "$file")" ]; then
  restore_failed
fi
echo "=== ${tag}RESTORED $file (same content as committed, no diff, no status)."

if [ -n "$refactor" ]; then
  if [ "$code" -eq 0 ]; then
    echo "=== ${tag}RESULT: KEPT (the command still passes after the refactor: the test does not depend on what it changed)."
    exit 0
  fi
  echo "=== ${tag}RESULT: BROKE (the command failed with exit $code after the refactor). Read the failure first: a build error, syntax error or missing import means the refactor was wrong, not the test. A failing assertion means the test is coupled to the internals or the edit changed behaviour. Lines that changed:"
  printf '%s\n' "$verdict_lines" | sed 's/^/    /'
  exit 1
fi
if [ "$code" -ne 0 ]; then
  echo "=== ${tag}RESULT: CAUGHT (the command failed with exit $code: the test detects the mutation)."
  exit 0
fi
echo "=== ${tag}RESULT: SURVIVED (the command passed with the mutation: the test does not detect it). Lines that changed:"
printf '%s\n' "$verdict_lines" | sed 's/^/    /'
exit 1
