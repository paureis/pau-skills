# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-10-17: code fences close the CommonMark way in arena and instructions-audit

- `arena.mjs` and the `instructions-audit` scanner toggled a code fence on any fence line, so a shorter fence inside a
  longer one, or a fence of the other character, ended the block early. A rubric that showed a nested fence could then
  count the wrong number of criteria, and the scanner could read code as headings, rules, imports or references. Both
  now close a fence only on a bare fence of the same character, at least as long, as `tests/style.test.mjs` and
  `verify-app` already did. The scanner's `splitUnits` had the same toggle and is fixed with them.
- Versions: agent-orchestration 0.5.1, session-discipline 0.7.1, pau-skills 0.9.1.

## 2026-10-17: tests clean up their temp folders

- `tempDir()` in `tests/helpers.mjs` now deletes every folder it made when the test process exits, and
  `removeAtExit()` does the same for a folder a script under test makes on its own (the arena `blind` test without
  `--out`). A full `npm test` used to leave about 150 folders in the system temp folder per run, which filled the disk
  of long cloud sessions; it now leaves none. Test-only change, no version bump.

## 2026-10-17: five more skills, and one command to zip skills for claude.ai

- New typed skills. All five start only when you type them, so they add nothing to every session's context.
  - `hillclimb` (verification, adapted from pstack): improves one metric (time, size, memory, a score) on a frozen
    harness proven sensitive by a deliberate regression, with a stop predicate that has a minimum number of attempts,
    one change per attempt, a commit per win, and an append-only decision log kept by `decisions.mjs` (`append`,
    `measure`, `summary`), plus a checklist run before any number is reported.
  - `skill-eval` (verification, adapted from pstack): checks whether a change to a skill or prompt changes what an
    agent does. Headless `claude -p` runs each see one variant in a neutral folder; a blind copy of what each run did
    goes to a reviewer with no tools and to your own blind read. `skill-eval.mjs` sets up, runs, blinds and unblinds.
  - `agent-friendly-audit` (planning, adapted from pstack): mines review comments, fix and revert commits, this
    project's transcripts and instruction files for the mistakes agents repeat, and proposes a fix for each at the
    highest layer it can live in, proven on a past instance. It writes nothing without a yes. `mine.mjs` does the
    read-only mining, with redaction, and reads only this project's transcript folders.
  - `sharpen` (planning, adapted from pstack): restates a task with the problem behind it and one outside check, and
    confirms in six lines before working.
  - `brainstorm` (planning, original): widens the options before `grill-me` narrows them, through named lenses,
    keep, kill or combine rounds, ratings never added into a score, and a premortem per finalist. `grill-me` now
    suggests it when there is only a goal.
- `scripts/pack-skills.mjs` (`npm run pack-skills`): one zip per skill for upload to claude.ai, by name, `--since <ref>`
  (it says which are new, changed or removed) or `--all`, built from the committed files and checked against the
  upload rules first. `dist/` is ignored.
- `which-skill` routes to the new skills.
- Versions: pau-skills 0.9.0, verification 0.7.0, planning 0.4.0, session-discipline 0.7.0.

## 2026-10-17: pau-skills-hooks, the hooks without the skills

- New plugin `pau-skills-hooks`: every hook in the marketplace and no skills, about zero tokens of always-on context.
  It is for people whose skills come from their claude.ai account (which syncs them to the terminal, the desktop app
  and the web) and who still want the guards and session hooks on their machine. `docs/INSTALL.md` has a section on
  this setup. `scripts/build-marketplace.mjs` fills in its hooks; a test checks it runs every hook and lists no skills.
- Versions: pau-skills-hooks 0.1.0.

## 2026-10-17: every skill uploads to claude.ai

- `verify-app`'s description wrote `verify-<app>`, which claude.ai reads as an XML tag and refuses to upload. It now
  says `verify-*`. `tests/context-budget.test.mjs` fails on any description with a tag-like `<...>`.
- `claude-md-audit` is renamed `instructions-audit`: claude.ai refuses skill names that contain "claude". Type
  `/instructions-audit` (or `/session-discipline:instructions-audit`) from now on. A marketplace test and
  `scripts/new-skill.mjs` refuse any skill name containing "claude" or "anthropic".
- Versions: pau-skills 0.8.0, verification 0.6.1, session-discipline 0.6.0.

## 2026-10-17: ideas from pstack, and a context budget

- New skills, adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT, see NOTICE):
  - `verify-app` (verification): generates and maintains a project skill that launches the real app, drives it like a
    user, keeps evidence and cleans up only what it started. `check-map.mjs` checks the generated skill.
  - `bug-fix` (verification): reproduce twice, test hypotheses with runtime evidence, fix the first wrong decision,
    commit the failing repro before the fix, and prove what the change cannot break.
  - `arena` (agent-orchestration): several subagents attempt one task with different briefs; a blind judge and the
    orchestrator's own scores pick a base, and the best parts are grafted by hand. `arena.mjs` makes the blind copy.
  - `architect` (planning): sketch two shapes before code, screen them against red flags for agent contributors,
    build against the sketch.
- Context budget: 17 skills you start on purpose now load only when you type them (`disable-model-invocation:
  true`). The 12 that load on their own have descriptions of at most 400 characters (about 4,450 in total, within
  the 4,500 limit), and `tests/context-budget.test.mjs` enforces the limits, reading descriptions the way YAML does.
  Skills that used to start a typed skill now suggest its `/` command. README, `which-skill` and ADDING-A-SKILL list
  the two groups, and `scripts/new-skill.mjs` scaffolds new skills in the typed tier.
- The style test also bans words and phrases typical of AI-written text, and skips code fences the CommonMark way.
- `evaluator` counts a drive through a project's verification skill as live evidence.
- NOTICE has corrected paths and a pstack section. `docs/BACKLOG.md` holds the rest of the pstack work, detailed
  enough for a new session to pick up.
- Versions: pau-skills 0.7.0, session-discipline 0.5.0, verification 0.6.0, agent-orchestration 0.5.0, guards 0.4.0,
  planning 0.3.0.

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
