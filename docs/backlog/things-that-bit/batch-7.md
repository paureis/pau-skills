# Things that bit the seventh batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the seventh batch (Q1, the first batch run with the roster):
- `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` set to 3 in the cloud environment arrived as 1: the cloud runtime overrides
  it. `eng-lead` planned and wrote the briefs, and the main session started every builder and reviewer itself. That
  worked; plan for it.
- The plan checks were worth more than ever: the ones in phase B built the whole slice in a clone before any builder
  started, and found an edit that could not catch its own mutation, a wrong path walk and a race that would have
  sent a builder to "fix" a good test. Every reviewer still found something the builder missed.
- The worktree guard refuses, for builders: a command that sets HOME or GIT_CONFIG_GLOBAL, a shell loop that passes a
  variable to node or sed, heredocs or python text that name git, and git chained with anything. A loop in a script
  file run as `bash <file>`, or a `.mjs` driver, works. Leave the HOME and git-config runs to the reviewer.
- The container restarted twice. Background agents were cut off mid-command while their status said "completed";
  their transcripts and worktrees survived, and each was resumed by id with SendMessage.
- The permission check refused writing "the owner said yes" into a brief before the owner had answered. Ask first,
  then write the answer.
- Long briefs worked better as files the agent reads than as pasted prompts, with a "Corrections after the plan
  check" section that wins over earlier text, and with shared parts pointing at one brief instead of repeated.
- Builders and reviewers redirected to `/dev/null` several times despite the standing order; it stayed a character
  device. Say "not even as a redirect target".
- A `TMPDIR` link must be short: a path with a part that starts with `-` (the scratchpad's) makes skill-eval warn on
  purpose, which looks like a failure.
