# Things that bit the twenty-ninth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q44:
- The builder's worktree guard refused heredocs that hold `!==`, `{ note` or any mention of git, and any command that
  names a `.github/` path together with other commands. Sed scripts written to files in the scratchpad and fed on
  standard input worked.
- `mutate.sh` cuts long diff lines short, so a mutation near the end of a long template string looks unchanged in its
  output; check the run's pass and fail counts instead.
- A rule change that turns old passes into failures needs the brief to list each assertion allowed to change, or a
  reviewer cannot tell it from a weakened test.
- Asserting only the end of a message (`includes(NOTE)`) leaves the start free to change; assert both ends.
- After a merged pull request deletes the working branch on the remote, `--force-with-lease` reports stale info; push
  the branch fresh.
- Two batches ran in one session with no compaction (0 compact_boundary lines in the transcript).
