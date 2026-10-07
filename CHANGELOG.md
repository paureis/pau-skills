# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-10-07: skills/ and hooks/ at the root

- Skills moved from `plugins/<plugin>/skills/` to `skills/<plugin>/`, and hook scripts from `plugins/<plugin>/scripts/`
  to `hooks/<plugin>/`. Plugin names and skill names are unchanged, so installs keep working after an update.
- Every plugin is now rooted at the repository, so all hooks share one `hooks/lib/config.mjs` instead of four copies.
- `mutate.sh` moved into `skills/verification/mutation-test/` and `safe-merge.mjs` into `skills/guards/safe-merge/`.
- Hook documentation moved from `docs/HOOKS.md` to `hooks/README.md`.
- Added CI, issue templates, this changelog and a contributor guide (`CLAUDE.md`).
- Versions: pau-skills 0.4.0, session-discipline 0.3.0, verification 0.4.0, agent-orchestration 0.3.0, guards 0.3.0,
  planning 0.2.0.

## 2026-10-07: 22 skills and 11 hooks ([#1](https://github.com/paureis/pau-skills/pull/1))

- New skills: `which-skill`, `rule-to-hook`, `claude-md-audit`, `flaky-test-hunt`, `migration-review`,
  `dependency-upgrade`, `parallel-worktrees`.
- New hooks: `secret-guard`, `destructive-guard`, `no-verify-guard`, `test-tamper-guard`, `verify-before-done`,
  `branch-context`, `compact-snapshot`. Any hook can be turned off in `.claude/pau-skills.json`.
- New `pau-skills` plugin that installs everything at once.
- `dependency-security-audit` now covers every common ecosystem, not only npm.
- README organised around the problems each piece fixes.

## First release

- Five plugins (session-discipline, verification, agent-orchestration, guards, planning) with 15 skills and 4 hooks.
