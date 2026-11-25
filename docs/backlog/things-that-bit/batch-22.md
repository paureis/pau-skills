# Things that bit the twenty-second batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q33, context in fewer calls:
- The orchestrator sent eng-lead a base commit it had not read yet (written in the same message as the command that
  printed the real one). Read the commit ID first, then write the brief; the correction reached eng-lead before it
  planned anything.
- A Windows rule in the brief ("compare lower-cased on win32") was built without its other half (resolve the roots
  first), and no Linux test could see it. Make path code take the path API as a parameter, and test it with
  `path.win32` on Linux.
- A "reads before the first edit" count needs a write rule as much as a read rule: `cat > file <<EOF` starts with
  `cat`. Take the rule from real commands in the transcripts, not from the command name.
- `mutate.sh` runs the command once as a control before it mutates. A command that also edits a second file must do
  so only in the mutant run, or the control fails and nothing is mutated.
- `git log` never lists a merge's files without an explicit `--diff-merges` option, so a mutant that drops
  `--no-merges` cannot be caught. Say so in the report instead of chasing it.
- Merging a pull request deletes the remote working branch; the next push recreates it ("new branch"). Worktree
  agents still branch from the base commit, which stays in the local object store.
- The agents of this session made most of their files through the shell, not Write, so a Write-only count of new
  files reads near zero on this repository. The git count covers them over the date range.
