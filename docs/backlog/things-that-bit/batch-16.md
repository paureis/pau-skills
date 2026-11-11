# Things that bit the sixteenth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q22, two hooks that get in the way:
- The auto mode classifier refused a logging hook in the user's settings as self-modification, so where SubagentStart
  fires was proven with headless runs that load their own settings file (`--settings`, `--max-budget-usd`).
- The subagents' own answers to "do you see the hook's line" contradicted their transcripts. A subagent's transcript
  (`subagents/agent-<id>.jsonl`, a `hook_additional_context` attachment) is the evidence, not its reply.
- A notification that arrives during a turn is stored as `queue-operation` and `attachment` entries; one that arrives
  while the session is idle is a `user` entry with `origin.kind` set. Only the second moved the window. Make it happen
  for real (a background command that ends after the turn) instead of guessing.
- The headless auto mode run did not reproduce the desktop app's refusal. The fix rested on SubagentStart reaching
  every launch, not on the reproduction.
- Both plan checks built the slice in a clone and found real defects the briefs had: a missing folder, a new line not
  read as a separator, a flag that swallowed a separator, quadratic shapes no planned timing case hit, and 27
  surviving mutations. The reviewers still found a design problem (a notification brought the same block back) that
  only a scenario across turns shows.
- A quadratic pattern can stay under a 500 ms bound at 100,000 characters (240 ms here); a 300,000-character case or a
  behaviour case catches it.
- Passing a 100,000-character command inside `node -e` fails to spawn on Linux (one argument over 131,072 bytes); pass
  it on standard input.
- `node --test a b` silently skips a missing file when other files are named; check the `# tests` count.
- The Stop hook asked for a push after every turn; the owner's "do not push" won each time.
- `eng-lead` handed back at once with each builder's ID, as told, and the reports came to the main session.
