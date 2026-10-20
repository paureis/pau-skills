# What protects the repository

Names and `${CLAUDE_SKILL_DIR}` mean what SKILL.md says: `${CLAUDE_SKILL_DIR}` is this folder.

Checked on Claude Code 2.1.303 with headless runs in October 2026.

- **The allow list is the protection.** Run the turns with `--permission-mode dontAsk` and one allow rule per thing
  the run does (LOOP.md has the full list): `Edit(/<worktree>/**)` for the code (an `Edit` rule covers Write and
  every other file-editing tool, Claude Code ignores `Write(path)` rules, and a rule path that starts with `//` is
  absolute), `Edit` for `<state>/resume.md` and `<state>/summary.md` only,
  `Bash(node <control>/log.mjs *)` for the log, `Bash(bash <control>/done.sh)`, the exact test command, and
  `Bash(git -C <worktree> add *)`, `commit *`, `restore *`, `status *`, `diff *`, `log *`, `show *` and
  `clean -f -- *` (the rule must match the form the run types: `git -C <worktree> status` is not covered by
  `Bash(git status *)`). In `dontAsk` everything else is refused: in the check, `rm -fr`, `mv`, `cp`, `sed -i`,
  `touch`, an `echo >>` redirect and a `>` redirect from an allowed command into the control folder were all refused,
  and so was plain `rm` in the worktree (revert a new file with `git -C <worktree> clean -f -- <file>`). A subagent
  gets the same rules. Commands Claude Code treats as read only (`cat`, `grep`, `ls`, a plain `git log`) still run
  without a rule: they read, and cannot write.
- **Not `acceptEdits`, not a blanket bypass.** `acceptEdits` approves `rm`, `mv`, `cp`, `sed -i`, `mkdir` and
  `touch` inside the working folders by mode, so a deny rule such as `Bash(rm -rf *)` is passed by `rm -fr`. Never
  use `--dangerously-skip-permissions`, `bypassPermissions` or `auto` for the night.
- **Deny rules are not a boundary.** Anything the run may execute that runs code the run can edit can push, deploy
  or delete past every deny rule: the test command and its configuration, build and package scripts, and git
  commit hooks (a `.husky/` folder, `core.hooksPath`). Deny rules only narrow a broad allow rule. Keep
  `Bash(git push *)` and the project's deploy commands denied anyway.
- **The strong protection takes the means away**: run the turns as a separate OS user, or in a container, that has
  no push credentials (no SSH agent, no git credential helper, no `gh` login) and mounts the control folder read
  only. Check it from inside before leaving: `git -C <worktree> push --dry-run` fails, `touch <control>/x` fails,
  `ssh-add -l` and `gh auth status` fail. Without that, `loop.sh` sets a cheap layer, a git setting through the
  environment that rewrites every push address to a path that does not exist (`bash <control>/loop.sh check` shows
  that a push is refused); code the run executes can undo it.
- **In a session that stays open**, check its permission mode first. In `auto` or `bypassPermissions` mode, or with
  broad allow rules such as `Bash(*)`, nothing above holds. Start the night's session from the worktree with
  `claude --permission-mode dontAsk` and the same allow and deny rules, or use the outer loop.
