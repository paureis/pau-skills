# Things that bit the first batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the first batch:
- Subagents could not launch subagents then. A builder that needs "a fresh agent" for a dry run uses a separate
  `claude -p` process, or reports the step as not done; the orchestrator can run the cold run instead. Since then
  (checked on 2.1.303) subagents can start subagents up to three layers deep; see Q2.
- Each Bash call is a fresh shell: variables do not survive between calls, and `$!` after `cd dir && cmd &` is the
  subshell, not the app. Skills that start processes must save state to a file and record the real process ID.
- Reviewers found real bugs in every item, including leaks in arena's blind judging and cleanup that could kill
  processes it did not start. Do not skip the review because the builder's own checks passed.
- The auto tier is full (12 skills, 4,448 of 4,500 characters). Every item left in this file is typed tier, so the
  limit does not block anything planned.
