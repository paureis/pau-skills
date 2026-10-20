# Things that bit the third batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the third batch (M1 with M3, M4 with M6, M2, M7):
- The plan checks again found a real problem in every brief: `gh pr view` fails here (GraphQL 403, use `gh api`
  REST), Node 20 in CI has no `fs.globSync`, the Agent tool's `model` field may be set only when the user asks for a
  model, and a documented reverse-diff command that `mutate.sh` would not accept.
- Reviewers found a must-fix in three of the four items (a reversed commit that deleted the file read as CAUGHT, a
  learned pattern that could leave a reproduced failure, a ratchet that asked to lower the real baseline when run
  from a subfolder). The cold runs again found what reviewers missed.
- A cold run that needs real subagents runs as a headless `claude -p` with an empty HOME, `--setting-sources project`
  and `--strict-mcp-config`. Under an empty HOME the default model can differ from the session's; pass `--model` when
  the result may depend on it (the oracle took its explorer path on one model and not on the other).
- A reviewer can finish its report and leave background work running. Stop it (TaskStop) once its findings are in.
- Pull requests here are squash-merged, so `git branch --merged` does not show a merged branch. Before deleting one,
  compare its tip with the head of its last merged pull request.
- The session's git proxy allows a push only to the session's own branch, and the GitHub API refuses to delete refs
  through it, so old branches cannot be deleted from a session. The owner deletes them on GitHub, or turns on
  "Automatically delete head branches" in the repository settings.
