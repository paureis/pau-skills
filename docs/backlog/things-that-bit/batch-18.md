# Things that bit the eighteenth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q24, verification ideas from the Claude Code team:
- The plan checks paid for themselves again. Each built its slice in a clone before any builder started, and found
  what a read of the brief would not: `GIT_DIFF_OPTS` and `diff.interHunkContext` put context lines into `-U0`
  output, the rules file could trigger its own entry, untracked folders crash a naive reader, Go's `testing/quick`
  prints no seed, a proptest mutation run leaves a file that makes the next `mutate.sh` refuse, and a REVIEW.md could
  escape the flag by adding a SKILL.md beside it.
- Exit codes are weak evidence. A rules edit in a fix is also NO_TEST and OUTSIDE, so "exit 1" proved nothing about
  the new RULES flag; the tests had to assert the flag itself.
- Every review still found tests that could not fail (four in slice 1, four paths in slice 2, six sentences in slice
  R), each found by a mutation of the reviewer's own. The builder's own mutation table is not enough.
- The project's own regexes cannot be timed by a test. They run in `node:vm` with a timeout, and an entry whose regex
  times out or overflows the stack is printed as triggered, never skipped.
- A change that edits the checks that judge it has more routes than the plan named: a local `git replace` of the base
  blob, a rules file committed as a symlink, a deleted SKILL.md beside an edited REVIEW.md. The script now sets
  `GIT_NO_REPLACE_OBJECTS=1` and reads only a regular file at the base.
- The roster test fails whenever `roster/` and `.claude/agents/` differ, so the roster change was its own slice,
  merged last with `--no-commit` and the copy in the same commit; the batch ran on one reviewer throughout.
- In the cloud runner the builders came back as background agents, so `eng-lead` handed back their IDs at once and the
  main session started the reviewers and sent the fix rounds. One `eng-lead` run planned; one more started three
  builders; slice 2's builder was started by the main session from its brief file.
- A reviewer must run the main checkout's copy of `review-scope.mjs`, not the slice's: a slice that edits the script
  would otherwise pick its own checklist.
- The proxy blocks most library docs sites. The library facts in PROPERTIES.md were taken from installing each library
  from its registry into a scratch folder and running a failing property.
- The worktree guard refuses Bash commands that chain git with other commands; builders ran one git command per call.
- A stop hook asks for a push at every turn end; the owner had asked to be asked first, so the pushes waited.
- The X post the owner shared would not load (HTTP 402), and the first docs link they sent was the mods interface
  page, so the session researched mods (Q25) while the post was about Code Mode (Q26). When a post will not load, ask
  for the feature's own docs page by name before researching, and say which page the research rests on.
