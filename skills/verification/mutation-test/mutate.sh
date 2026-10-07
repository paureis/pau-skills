#!/usr/bin/env bash
# Mutation harness: prove a test can FAIL by breaking the code it guards, then restore. One hand mutation per run,
# with every step that has silently lied before asserted by the script instead of from memory.
#
# Usage, from anywhere inside a git repository, with the mutation on standard input:
#   mutate.sh [--label <name>] <file> <command...> < mutation.sed
#   mutate.sh [--label <name>] <file> <command...> < mutation.patch
#   mutate.sh [--label <name>] --sed '<expression>' <file> <command...>
# <file> is relative to the repository root; the command runs from the repository root.
# The mutation is a unified diff (if it starts with "diff" or "---", applied with `git apply --ignore-whitespace`) or a
# sed script. Examples:
#   echo 's/=== tenantId/!== tenantId/' | mutate.sh src/repo.ts npx vitest run tests/repo.test.ts
#   mutate.sh --label no-auth --sed 's/requireAuth(req)/true/' src/api.ts npm test
#
# Steps, and why each one exists:
#  1. Refuses to run on a dirty tree: restoring with `git checkout -- <file>` erases every uncommitted change in that
#     file, so a mutation on top of uncommitted work loses the work (this has happened). Commit first.
#  2. Runs the command once WITHOUT the mutation (the control) and exits 2 if it fails: without it, a mistyped command
#     (exit 127) or a missing test file would count as a caught mutation.
#  3. Assertion one, the mutation APPLIED: for a patch, `git apply --numstat` must show it touches only <file> (the
#     restore only restores that file); after applying, <file> must differ BY CONTENT with carriage returns stripped,
#     not by `git status` (on a Windows checkout `sed -i` rewrites CRLF line endings even when nothing matched, and git
#     then reports the file modified, which made a no-op mutation read as SURVIVED).
#  4. Prints the changed lines (`git diff -U0`), runs the command and keeps its exit code. Assertion two, behaviour
#     CHANGED: the control passed, so a failure now is the mutation being caught. On SURVIVED the changed lines are
#     printed again: a mutation can apply without changing behaviour (one that only appended "and true" to a SQL join
#     read as a weak test), so read them before believing a SURVIVED.
#  5. Assertion three, the restore WORKED: restores ONLY <file> and checks that file has no diff and no status (not the
#     whole tree: the command may leave untracked outputs such as snapshots or reports).
# Exit: 0 CAUGHT (the command failed with the mutation), 1 SURVIVED (the command passed: the test cannot fail that
# way, fix the test), 2 the harness could not do its job (usage, dirty tree, control failed, mutation did not apply,
# restore failed).
set -u

usage() { echo "Usage: mutate.sh [--label <name>] [--sed '<expression>'] <file> <command...>   (mutation on stdin unless --sed)" >&2; exit 2; }

label=""
sed_expr=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --label) [ "$#" -ge 2 ] || usage; label="$2"; shift 2 ;;
    --sed) [ "$#" -ge 2 ] || usage; sed_expr="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) break ;;
  esac
done
[ "$#" -ge 2 ] || usage
file="$1"
shift
tag="${label:+[$label] }"

root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "${tag}NOT MUTATED: not inside a git repository." >&2; exit 2; }
cd "$root" || exit 2

if [ ! -f "$file" ]; then
  echo "${tag}NOT MUTATED: $file does not exist (paths are relative to the repository root)." >&2
  exit 2
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "${tag}NOT MUTATED: the tree has uncommitted changes (the restore would erase those in $file). Commit first:" >&2
  git status --short >&2
  exit 2
fi
if ! git ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
  echo "${tag}NOT MUTATED: $file is not tracked by git, so it cannot be restored." >&2
  exit 2
fi

mutation="$(mktemp)"
trap 'rm -f "$mutation"' EXIT
if [ -n "$sed_expr" ]; then
  printf '%s\n' "$sed_expr" > "$mutation"
else
  cat > "$mutation"
fi
if [ ! -s "$mutation" ]; then
  echo "${tag}NOT MUTATED: the mutation (patch or sed) arrived empty." >&2
  exit 2
fi

echo "=== ${tag}CONTROL (unmutated): $*"
"$@"
control=$?
if [ "$control" -ne 0 ]; then
  echo "${tag}NOT MUTATED: the command fails without the mutation (exit $control): a failure with it would prove nothing." >&2
  exit 2
fi

content_hash() { tr -d '\r' < "$1" | git hash-object --stdin; }
before="$(content_hash "$file")"
if head -c 4 "$mutation" | grep -qE '^(diff|---)'; then
  touched="$(git apply --numstat "$mutation" 2>/dev/null | awk '{print $3}')"
  if [ "$touched" != "$file" ]; then
    echo "${tag}NOT MUTATED: the patch must touch only $file and it touches: ${touched:-nothing it can parse}" >&2
    exit 2
  fi
  git apply --ignore-whitespace "$mutation" || { echo "${tag}NOT MUTATED: the patch did not apply." >&2; git checkout -- "$file"; exit 2; }
else
  # GNU sed takes -i alone; BSD sed (macOS) needs an explicit, empty backup suffix.
  if sed --version >/dev/null 2>&1; then inplace=(-i); else inplace=(-i ''); fi
  sed "${inplace[@]}" -f "$mutation" "$file" || { echo "${tag}NOT MUTATED: sed failed." >&2; git checkout -- "$file"; exit 2; }
fi
after="$(content_hash "$file")"
if [ "$before" = "$after" ]; then
  echo "${tag}NOT MUTATED: the mutation did not change the content of $file (does the pattern match?)." >&2
  git checkout -- "$file"
  exit 2
fi

changed_lines() {
  diff -U0 <(git show "HEAD:./$file" | tr -d '\r') <(tr -d '\r' < "$file") | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | cut -c1-160
}
echo "=== ${tag}MUTATION APPLIED to $file:"
changed_lines

echo "=== ${tag}COMMAND: $*"
"$@"
code=$?
survived_lines=""
[ "$code" -eq 0 ] && survived_lines="$(changed_lines)"

git checkout -- "$file"
if ! git diff --quiet -- "$file" || [ -n "$(git status --porcelain -- "$file")" ]; then
  echo "${tag}ERROR: restoring $file did not leave it clean:" >&2
  git status --short -- "$file" >&2
  exit 2
fi
echo "=== ${tag}RESTORED $file (no diff, no status)."

if [ "$code" -ne 0 ]; then
  echo "=== ${tag}RESULT: CAUGHT (the command failed with exit $code: the test detects the mutation)."
  exit 0
fi
echo "=== ${tag}RESULT: SURVIVED (the command passed with the mutation: the test does not detect it). Lines that changed:"
printf '%s\n' "$survived_lines" | sed 's/^/    /'
exit 1
