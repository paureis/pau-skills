# Things that bit the fifth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the fifth batch (N8, N9, P1.6 to P1.8, and two follow-ups the owner added: the hillclimb log guard
and the mutate.sh restore):
- The plan checks found a real problem in every brief again: `marketplace.json` lists plugin folders, so a new skill
  needs no rebuild; six pstack principle bodies were cut on purpose upstream (the full text is in earlier commits);
  bigram containment cannot score a short CLAUDE.md bullet; `/loop` and session jobs only wake a session that stays
  open; and a past file time alone does not reproduce git's stat-cache problem.
- This sandbox's `/root/.gitconfig` sets `core.checkStat minimal` and `core.trustctime false`, which CI runners do
  not. A test about git's stat behaviour sets its own repository config and points `GIT_CONFIG_GLOBAL` at an empty
  file.
- A plan checker experimenting as root ran `mv mod.js /dev/null` and replaced `/dev/null` with a regular file; the
  owner approved restoring it (`mknod -m 666 /dev/null.new c 1 3 && mv -f /dev/null.new /dev/null`). Tell every
  subagent to keep `mv`, `rm` and redirections inside its own `mktemp -d` folder.
- Reviewers found must-fix problems in N8 (a turn could rewrite its own predicate and log; `acceptEdits` approves
  `rm`, `mv`, `cp` and `sed -i` by mode, so `rm -fr` passed a deny rule for `rm -rf`) and in the mutate.sh
  restore (deleting the file first erased an uncommitted edit git did not see). The cold runs again found what the
  reviewers missed: N8's morning audit did not work end to end.
- Headless permission facts, proven on 2.1.303: `--allowedTools` and `--disallowedTools` take several values, so a
  prompt after them is swallowed (put it right after `-p`); Claude Code ignores `Write(path)` rules, and `Edit(path)`
  rules cover every file-editing tool; a skill's `allowed-tools` does not carry into a `--resume`d session;
  `dontAsk` refuses everything without an allow rule except commands it treats as read only.
- The container restarted mid-batch. Stopped agents were resumed by id with SendMessage (their names no longer
  resolved); the worktrees and the scratchpad survived.
- CI on macOS failed on a test that mutated a tracked symlink with `sed`: BSD `sed -i` refuses to edit a symlink,
  while GNU `sed` replaces it with a regular file. The test now changes the link with a patch, which `git apply`
  handles the same on both.
