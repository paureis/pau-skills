# Things that bit the twenty-eighth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q43:
- This session's clone was shallow and its `origin/main` ref was stale (pull request 91, from before the lock line)
  until `git fetch origin main`. A local merge base can be old or predate the file; fetch first, and make any check
  that reads a base pass on a missing file.
- `actions/checkout@v4` fetches one commit by default, so on a pull request only the synthetic merge commit is there
  and no base is reachable. `HEAD^1` of the merge ref is the base tip; on a push, `github.event.before` is the right
  base, because a rebase merge or multi-commit push makes `HEAD^1` wrong.
- A test file that holds both the code and its tests needs sed patterns anchored to the code line: a looser pattern
  also edits the asserting lines and gives a false SURVIVED.
- `runGit` returns no stderr and defaults to a 2 second timeout. A timeout reads as "git cannot run", so a check that
  passes on that path needs a longer timeout to stay on in CI.
- JavaScript's `m` flag already ends a line at `\r`, so a CRLF replace before a multiline match is a safeguard that no
  test can fail.
- A test that sets origin/main to an ancestor of HEAD cannot tell the merge base from the origin/main tip; use a
  sibling branch.
- `git merge -F -` does not read standard input; write the message to a file.
- Builders committed on the harness branch, as told (no branch named in the brief).
