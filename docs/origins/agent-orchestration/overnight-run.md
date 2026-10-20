# overnight-run and `log.mjs` (Adapted from pstack [`docs/guide/07-overnight.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/docs/guide/07-overnight.md), `skills/poteto-mode/playbooks/autonomous-run.md`, `playbooks/pause-safely.md` and `skills/show-me-your-work`)

Back to the [origins index](../../ORIGINS.md).

Closest upstream, at 09d06eb: `docs/guide/07-overnight.md` (earning the trust, the contract),
`skills/poteto-mode/playbooks/autonomous-run.md` (the loop, "a plateau is not a stop"),
`skills/poteto-mode/playbooks/pause-safely.md` (the pause and the resume note) and `skills/show-me-your-work/SKILL.md`
with `scripts/log.sh` (the log columns, cleaning cells, the audit of the log against the transcript, "correct the log,
not the story", the Attention section). The structure comes from there; shared text is under 2% (word 6-grams: 5 of
3,152 words of SKILL.md against `07-overnight.md`, 2 against `autonomous-run.md`, 16 of 702 words of AUDIT.md against
`show-me-your-work`, measured on the first draft).

**Problem.** Unattended agent runs end in unchecked work and a story nobody can audit: hours of motion, a goal relaxed
quietly, and no way to tell what was done.

**What this version changes.**
- Written for Claude Code. Cursor's loop and cloud agents become a table of ways to wake a run and what each needs:
  in-turn work, `/loop` and session jobs (they end with the process), an outer shell loop around `claude -p` with
  `--session-id` and `--resume`, a cloud scheduled task (sees only pushed work), Monitor and background Bash, and a
  check-in tool only where the session lists one.
- Trust is a gate: a missing item means no loop, and the reply is a table of what is missing.
- The predicate is `done.sh`, fingerprinted with the files that define it, and counts only on a clean tree.
- A control folder holds the contract, the predicate, the loop script and copies of `log.mjs` and `AUDIT.md`; no turn
  can write it. Turns run in `--permission-mode dontAsk` with one allow rule per command, never `acceptEdits` (which
  approves `rm`, `mv`, `cp` and `sed -i` by mode) and never a bypass. The skill says plainly that deny rules are not a
  boundary (tests, build scripts and commit hooks run code the run can edit) and that the strong protection is a
  user or container with no push credentials; the loop adds a git setting that rewrites every push address.
- The log lives outside the work tree. `log.mjs` refuses a path inside a git work tree, appends one row per call
  without rereading the file, adds an id, a run column (the session id, in place of upstream's `start` rows) and a
  supersedes column, flattens control characters and then guards a cell a spreadsheet would read as a formula, and
  refuses empty fields, bad headers, cut lines and wrong field counts. `log.mjs calls` lists a transcript's tool calls
  with message ids for the audit.
- An off switch file checked on its own, a resume note, and a loop that stops its running turn on a signal.
- Mid-run discoveries are logged and fixed only when they block the predicate.
- The reviewer is a fresh subagent that did not see the run, not a different model family; the Attention section
  reads "reviewed by a fresh subagent that did not see the run", with no model name.
- Stop rules point to `methodology`, one-number runs to `hillclimb`, grading to `evaluator`, each if installed.

**Review and cold run.** The plan check found that `/loop` only wakes a session that stays open. The first review
found that a turn could rewrite its own predicate and log under the documented flags, that `acceptEdits` let `rm -fr`
past a deny rule for `rm -rf`, and that the deny list was presented as a boundary; the cold run, which ran the outer
loop for real, found the morning audit broken end to end (the prompt lost after a variadic flag, the audit file out of
reach, `git -C` commands refused). All were fixed and proven in headless runs. A last probe found that Claude Code
ignores `Write(path)` rules (`Edit` rules cover every file tool), so the skill uses `Edit` rules only.
