# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-10-17: review-triage and lean-subagent-dev

- New skill: `review-triage` (verification). Decides which review findings are worth fixing: a finding must name a
  failure, is rated by value, effort and the risk of the fix, and lands in must fix, fix if cheap, or leave. Every fix
  has a test that fails without it, the second look covers only the fix, and there is one review round and one fix
  round. `review-scope.mjs` prints the project's rules from `.claude/review-rules.json`, scopes a change, and flags a
  fix round with no test, in risky code, or outside the change.
- New skill: `lean-subagent-dev` (agent-orchestration). A way of working for a whole session: one subagent at a time
  with a written brief, the main session checks the work itself, and the review follows the same triage method. The
  usage budget (`LEAN_SUBAGENT_BUDGET` or the project file) sets the delegation threshold, the subagent's model and
  how much review to run. It carries identical copies of `TRIAGE.md` and `review-scope.mjs`, so it works on its own.
- `which-skill` routes to both.
- Versions: pau-skills 0.6.0, session-discipline 0.4.2, verification 0.5.0, agent-orchestration 0.4.0.

## 2026-10-11: project-setup speaks the user's language

- `project-setup` picks the user's language before its first message: a language named in the arguments (for
  example `/project-setup full spanish`), else the language the user writes in. It keeps to it for the whole run,
  asks which language to write the project files in, and saves a "Preferred language" line with the personal
  preferences. `STYLE.md` has rules for writing in other languages.
- New eval scenario `spanish-beginner`; the grader detects Spanish, splits Spanish sentences and reads Spanish
  approvals.
- Versions: pau-skills 0.5.1, session-discipline 0.4.1.

## 2026-10-09: project-setup

- New skill: `project-setup` (session-discipline). An adaptive interview that writes the project CLAUDE.md and,
  with a separate yes, the user's personal preferences, then starts a first task. Written for people new to Claude
  Code. It stands alone and uses `${CLAUDE_SKILL_DIR}`, so it works without the plugin.
- New `evals/project-setup/`: runs the skill against simulated users and grades the transcripts.
- Every skill now works on its own, without the plugin or any other skill. Skills find their files through
  `${CLAUDE_SKILL_DIR}` instead of `${CLAUDE_PLUGIN_ROOT}`, which is set only for plugins. A mention of another skill
  is optional and says what to do without it: `methodology` describes the evaluator itself, `handoff` and
  `session-close` have a short retrospective, `session-close` has a handoff template and its own copy of `audit.mjs`,
  and `rule-to-hook` and `evaluator` treat `mutate.sh` as a shortcut. `tests/standalone.test.mjs` checks this.
- Versions: pau-skills 0.5.0, session-discipline 0.4.0, verification 0.4.1, agent-orchestration 0.3.1, guards 0.3.1,
  planning 0.2.1.

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
