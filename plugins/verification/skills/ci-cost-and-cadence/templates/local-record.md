# Local record and merge gate: pseudocode

STARTING POINT. Three small parts: the wrapper that runs the full local suite and writes the record, the lookup the
merge command calls, and the push check the push guard calls. All errors are refusals. This is a guard against
forgetting, not against fraud: the record is a text file anyone can write.

## Where it lives

`<git rev-parse --git-common-dir>/ci-records.jsonl`: outside the versioned tree, shared by every worktree of the clone,
invisible to other clones (the merge command then refuses, which fails closed). Append by writing a temporary file and
renaming it over the original. Keep the last N lines.

## The wrapper (run the whole suite, then record)

```
FORBIDDEN_ENV = [vars that skip the build, the DB reset or the server, point at another server, select a subset,
                 or switch on CI mode]                       # list them for your test runner

start():
  refuse (exit 2) if any argument was given
  refuse (exit 4) if any FORBIDDEN_ENV is set
  refuse if `git status --porcelain --untracked-files=all` is not empty
         (exception: untracked files that are documentation)
  refuse if installed dependencies do not match the lockfile
  remember commit = HEAD, tree = HEAD^{tree}

run steps in order, stopping at the first failure:
  reset the local database from seed, generated-code checks, typecheck, lint, unit, integration,
  end-to-end against a PRODUCTION build, then "every test ran" (executed list == runner --list output)

finish():
  refuse if any step failed or was skipped
  refuse if HEAD or HEAD^{tree} changed, or the working tree is no longer clean
  append { version, commit, tree, date, host, steps: [...], prod_build: true, all_tests_ran: true,
           arguments: [], forbidden_env: [], deps_match_lock: true }
```

## The record check (used by the merge command and the push check)

```
valid(line): every field above present with exactly those values; commit and tree are 40-hex; version is current

has_record(head_commit, head_tree):
  for line in records (newest first), skipping invalid lines:
    if line.tree == head_tree: return yes
    if line.commit is an ANCESTOR of head_commit                     # never a three-dot compare alone (TRAPS.md, 13)
       and every path in `git diff --name-only --no-renames line.commit head_commit` is documentation:
      return yes ("inherits the record of line.commit")
  return no
```

## The merge command (PR to the integration branch only)

```
head = PR head commit (from the API), head_tree = its tree (from the API)
if every path in the PR's own diff (base...head) is documentation: allow, and say "docs only, no record needed"
if has_record(head, head_tree): merge pinned to head (so a push in between cannot slip in)
else: refuse with exit 3, change nothing, print the command that creates the record
```

No flag skips it. The owner keeps whatever manual path the hosting platform gives administrators; write that down as
their exception, not the agent's.

## The push check (called by the push guard for a plain push from the integration branch)

```
changed = `git diff --name-only --no-renames origin/<integration> HEAD`
if changed is empty: allow
if every path is documentation: allow
if has_record(HEAD, HEAD^{tree}): allow
else: deny, and print what is missing
```

Keep its runtime small and bounded: the guard hook that calls it fails open if it times out.

## Unit cases worth a mutation each

No record; a record of another tree; a record whose commit is not an ancestor but whose three-dot diff is docs only;
docs-only difference from an ancestor record; a code difference; a record without the production build; a record with
the total not checked; a record from a run with a forbidden variable; a dirty tree at start or at end; HEAD moved
during the run; a corrupt line; dependencies out of sync with the lockfile.
