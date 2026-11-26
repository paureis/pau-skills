# Things that bit the twenty-fourth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q38, subagent-watchdog fixes and a compaction count:
- SessionStart compact and PostCompact fire before the new compact_boundary line is written to the transcript, for
  manual and auto compaction alike (Claude Code 2.1.332). A count read at SessionStart is one short; store it at
  PreCompact instead.
- One auto run showed a PreCompact with no compaction after it. Do not count a compaction from PreCompact alone.
- Claude Code refused a subagent's Write of a file that looked like a report, and that refusal fired no hook event.
  A probe that needs a subagent to write a file should ask for a plain data file.
- A TaskStop on a task that is gone returns "No task found with ID: <id>" and fires no PostToolUseFailure.
- The harness flagged `--permission-mode bypassPermissions` in a probe. `--allowedTools` with the exact tools is
  enough, plus `--add-dir` for a folder outside the project.
- A rule that fires once (the no-edit note) cannot show in a live run that a later event reset its count. Log every
  hook's input and output in the cold run, then replay the recorded events through the real hook and read the stored
  state after each one.
- A brief's own expected count was wrong (`[B,S,A,B,S]` is 2 compactions, not 3) and the plan check caught it. Work
  each worked example in a brief through the rule before dispatch.
- After a merge deletes the remote working branch, `git push --force-with-lease` fails against the old ref; push with
  a plain `git push -u`.
- hooks/README.md was 463 bytes under its 20,000-byte limit before the batch and is 14 under now. Make room before the
  next addition.
