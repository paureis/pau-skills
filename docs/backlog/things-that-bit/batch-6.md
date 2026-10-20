# Things that bit the sixth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the sixth batch (Q2, Q5 with Q9, Q6, Q7):
- The plan checks found must-fix problems in every brief again: `skill-eval` cannot run several turns (its runner
  passes `--no-session-persistence`); in `-p`, acceptEdits still refuses Bash without allow rules, refuses a write
  under `.claude/` (a protected path; use `--permission-mode auto`), and refuses a skill with `allowed-tools` unless
  `--allowedTools "Skill(<name>)"` is passed; `node --test <folder>` fails on Node 22 (run it inside the folder);
  AskUserQuestion takes 2 to 4 options per question and headers of 12 characters.
- Nesting was off: the cloud environment set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`. Headless children that need
  nested agents set it to 3. Under an empty HOME the default model was a different one again; pin `--model`.
- Reviewers found a must-fix in Q2 (false parse errors, a branch reset, a restore that deleted uncommitted work), Q6
  (five ways to a false GO, secrets quoted into the ledger) and Q7 (a pass with nothing measured). The cold runs
  again found what reviewers missed: `eng-lead` could not wait for builders it resumed, and a fixture's README gave
  away its seeded gap.
- `AGENTS.md` is a link to `CLAUDE.md`: an edit applied to both lands twice. Edit `CLAUDE.md` only.
- CI on macOS failed again on `/var` against `/private/var` (git prints the real path). Before pushing a change that
  compares paths, run its tests with `TMPDIR` set to a link to a real folder.
- GitHub's hosted runners held every job queued for about ten minutes; the repository is public, so it was not a
  minutes limit. Wait, then check that each job ran on the current head.
- A background run whose shell reset to the main checkout left log files there; check `git status` in the main
  checkout after each agent reports.
- `claude plugin validate <folder>` accepts a folder of agents only at a `.claude/agents` path.
