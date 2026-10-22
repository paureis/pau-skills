# Things that bit the seventh batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the seventh batch (Q1, the first batch run with the roster):
- `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` set to 3 in the cloud environment arrived as 1: the cloud runtime overrides
  it. `eng-lead` planned and wrote the briefs, and the main session started every builder and reviewer itself. That
  worked; plan for it. Fixed on 2026-10-22: the runner puts the 1 into the process environment, and a project
  `.claude/settings.json` with `"env": { "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "3" }` wins over it. Proven on
  2.1.307 with two headless runs: without the file the variable read 1 and a subagent had no Agent tool; with it the
  variable read 3 and a second-level agent ran. The file takes effect when a session starts, so only sessions started
  after it reached main have nesting.
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

Things that bit Q4, the second part of the seventh batch:
- Reviewers still found something on most slices after the plan checks, and the cold run found what they missed:
  in a fresh session the agent wrote a big fixture with a Bash generator, which no Write or Edit hook sees.
- A hook that skips "generated" files by a header marker skipped its own test file, which quoted the marker. Keep
  such markers out of the first lines of every file, and test that no tracked file matches the skip rule.
- `export *` in a split entry exports helpers the old file kept private; re-export by name and diff the export list.
  A class checked with `instanceof` must be declared once, or the check fails silently while every test passes.
- A builder's worktree guard refuses a command with a `find` that names `./.git`, `env -u` inside `$(...)`, and a
  `{ ...; } > file` group; put such steps in a script file and run `bash <file>`.
- When the orchestrator's shell runs `cd` into an agent's worktree, the session's working folder moves there. Use
  absolute paths and `git -C` from the orchestrator.
- Nine tracked files ended between 18,000 and 20,000 bytes; the hook will ask when any of them grows past 20,000.

Things that bit Q10, the third part of the seventh batch:
- With nesting on, `eng-lead` started six builders, but the session ran them in the background and `eng-lead` handed
  back before any reported. The main session then started the reviewers and sent the fix rounds, with the reviewer
  contract as a file every reviewer read. Plan for it: the builders' reports come to the main session.
- A plan check found that a mutation's test glob matched no file at the base (`tests/<name>-*.test.mjs` before the
  split), so node ran 0 tests, the control passed and the mutation read as SURVIVED. Every mutate.sh run reports its
  `# tests` line, and a base run for a split file waits for the split commit.
- A backslash-u escape typed into a tool call parameter reached the file as the raw character: a brief told the
  builder to use the BOM escape and held a raw BOM, and the builder's Edit tool did the same. Describe an escape in
  words (a backslash, the letter u, FEFF), build it with `String.fromCharCode(92)`, and check with
  `grep -P '\xEF\xBB\xBF'`.
- An order check `indexOf(a) < indexOf(b)` passes when `a` is missing (-1); check the index is not -1. Two agents
  with the same default name are never compared by `geppetto`'s overlap check; give them names.
- In a headless cold run, a compound command with a shell variable (`S=$(mktemp -d) && ...`, or an `echo rc=$?`) is
  refused, and so is a redirect to a folder outside the working directory. The agent then dropped a step without
  saying so, until the skill told it to run `mktemp -d` alone, write the path literally and report a skipped step.
- A headless child under an empty HOME was logged in through the container's agent proxy; no login variable was
  needed. Reads of `~/.claude` files were refused for a project skill without `allowed-tools`. With them in
  `allowed-tools`, the reads worked only when `--allowedTools` also listed `Skill(<name>)`; without it the skill did
  not load at all, and the agent did the audit by hand.
- A builder's worktree guard also refused `sed -f <file>` on a worktree file and `git diff` in a command with a pipe.
  A plain `sed -i '<expression>' <file>`, or a node script run from the scratchpad, worked.
- A foreground `sleep` of more than a few seconds is refused in an agent's Bash; a wait is a Bash call with
  `run_in_background: true`, read when it completes.
