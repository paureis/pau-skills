# Things that bit the P0.5 batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the P0.5 batch (every skill loads on its own):
- The plan checks again found a real problem in every brief: tests already committed at the base that the brief said
  were "being rewritten", a `grep` with an escaped backtick that matched nothing, skills off the confirm list that do
  write (`architect`, `to-prd`), `evaluator` running as a forked agent that cannot get a yes, and `project-setup`,
  whose first visible text must be its introduction.
- In a worktree `.git` is a file, so a brief that says "write the commit message under `.git/`" needs
  `$(git rev-parse --git-dir)`.
- The cold run found what the reviewer only suspected: a description lists phrases as "Use when the user says ...",
  so a matched remark ("the code is getting messy") counted as the user asking, and the confirm never fired. The fix
  was both: quote only phrases that ask for the work, and say in the paragraph that a remark is not asking.
- A confirm step on every skill that writes asks twice where the skill already stops for a yes. The owner trimmed the
  list from 23 to 13: only costs with no other gate.
- Headless runs in default permission mode deny every write, which hides what a skill does after its first step; the
  skill choice still shows. Pass `--permission-mode acceptEdits` in a throwaway copy when the later steps matter.
- The container restarted mid-batch and the fix rounds' reports were lost from the conversation; the commits and the
  agents' output files survived. Read the last handback from each output file.
