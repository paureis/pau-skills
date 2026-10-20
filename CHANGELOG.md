# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-10-20: instructions-audit inside a worktree

- `instructions-audit`: `scan.mjs` found no nested CLAUDE.md or AGENTS.md when the project itself sat below a
  `.claude` folder, which every Claude Code worktree under `.claude/worktrees/` does. Now only a `.claude` folder
  inside the project hides nested files. Found by the Q1 audit; a new test covers it.
- Versions: session-discipline 0.11.1, pau-skills 0.14.2. No hook changed.

## 2026-10-20: the seventh batch, Q1 test-value audit

- Every test file was sampled by mutation: 448 runs over the 39 files, 428 caught, and the reviews reran 219 of
  them with the same verdict. Tests only; no skill, hook or script changed, so no version moved.
- Removed one test that repeated another (verify-app, "a feature with no screen passes with a one-line States
  body"; its one extra check moved into the clean-file test).
- Rewritten so they catch the break they missed: `rm -r --no-preserve-root`, the safe-merge promotion pair and its
  error messages, the backtick guard's printf case, roadmap `tables()`, the 5 MB transcript message, new-skill's
  cross-plugin refusal, instructions-audit masking at 7 to 9 characters, geppetto's shadowed warning, the
  parallel-worktrees overlap count, the CRLF ledger, the secret-token limits and the hanging-run timeout.
- Isolated from the machine: every hook test sets its own user config, project folder and `PAU_SKILLS_DISABLE`;
  test repositories commit unsigned; launch-readiness runs in UTC; nothing writes to the real home folder; tests
  that cannot pass with the temporary folder below a `.git` or `.claude` folder fail once with a clear message, and
  the not-a-repository cases stop git at the temporary folder.
- Added one off-switch test per hook (12): with the hook turned off in the project config, or with
  `PAU_SKILLS_DISABLE`, it exits 0 and prints nothing.
- The suite goes from 1,166 to 1,177 tests.

## 2026-10-19: after the sixth batch, the owner's decisions (decision 10)

- `geppetto`: `eng-lead` drops SendMessage (the main session sends the fix rounds); the roster goes to version 2, so
  run Update on installed copies. `check-agents.mjs`'s parse warning gives a validate command that works for a
  folder not ending in `.claude/agents` (it validates a copy under a temporary `.claude/agents`).
- `launch-readiness`: before writing probes that fail while their gap is open, it asks how they should run; the
  framework's expected-failure form is the recommended first answer, a plain failing test the second.
- `verify-app`: create mode's final message starts with the filled report block. Maintain mode's source wave runs
  as subagents unless the map has at most two feature files or the session cannot start subagents, and the report
  says which.
- `to-prd`: step 2 no longer asks the user about modules and tests; the PRD lists them from the conversation, and
  the message after saving names any choice the conversation did not settle.
- Versions: agent-orchestration 0.10.1, planning 0.8.1, verification 0.11.1, pau-skills 0.14.1. No hook changed.

## 2026-10-19: the sixth batch (geppetto, launch-readiness, verify-app states, a lighter brainstorm, html-plan links)

- `geppetto` (new, agent-orchestration, Original): designs, installs, audits and updates a project's agent files.
  Bundled roster: `eng-lead` (plans and dispatches, cannot write code), `builder` (worktree, test first, never
  pushes), `reviewer`, `writer` and `sweeper`, each with the covenant from `COVENANT.md`. `check-agents.mjs` finds
  what makes Claude Code skip an agent or change its tools: frontmatter it cannot read, a missing name, unknown
  fields, bad values, duplicates, memory on a read-only agent, Glob or Grep next to Bash, a missing or old covenant,
  skills that are not installed, overlapping descriptions and an unignored `.claude/worktrees/`. Asks before every
  write. This repository's `.claude/agents/` now holds the roster.
- `launch-readiness` (new, verification, Original): an honest go or no-go for the stage an app is entering (private
  beta, paying customers, enterprise, regulated data). The profile is confirmed first; 15 area files load only when
  they apply; every row needs `file:line` or a command; security suspects are confirmed by probe tests in the
  project's own framework; a questionnaire with expiry covers what code cannot show; `ledger.mjs` keeps
  `READINESS.md`, rechecks rows whose cited files changed, never gives GO for a stage it did not assess, and refuses
  secret values in evidence. Two fixtures: a web app with seeded gaps and a Python CLI.
- `brainstorm`: lighter. Frame asks at most three questions at once, with proposed answers, through the question tool
  when the session has one, and shows the frame only after the answers. 8 to 12 options show in 3 or 4 clusters with
  no lens tags (the lenses stay, used internally). One round of picks, with the agent's marked "(Recommended)" and a
  reason each, accepted with an "ok" ("blind" holds them back). Improvements fold into 3 or 4 finalists. Statuses
  are kept, dropped and chosen, and the summary is shorter.
- `grill-me`: asks each question with the question tool when the session has one, recommended answer first. With
  three or more decisions open at once, it offers one html-plan page if it is installed, as its own question first;
  the page's answers feed the next branch, never a build.
- `architect`: when it stops at Agree, it offers to show the design as an html-plan page if it is installed.
- `to-prd`: after saving the PRD, it offers to render it as an html-plan page if it is installed; the answers update
  the PRD and never start a build.
- `verify-app` (verification): feature files gain a fifth heading, States (loading, empty and error, with a
  screenshot each, or "no screen"), which `check-map.mjs` requires and, for old maps, says maintain mode adds. The
  generated skill gains a States and skeletons recipe and the in-page helper `measure-boxes.js`, which reports
  skeleton boxes off by more than 4 px and a layout-shift score above 0.1 (Chromium only), fails when nothing
  matched, and resizes a skeleton only on a yes. A request only about a skeleton runs that recipe. A new
  `web-skeleton` fixture.
- `which-skill`: routes "show me the plan as a page" to html-plan (an outside skill), a jumping skeleton to
  `verify-app`, and says how html-plan, `to-prd` and `architect` differ.
- `tests/context-budget.test.mjs`: the description total is 14,000 characters (was 13,000), by the owner's choice.
- `tests/standalone.test.mjs`: also checks mentions of html-plan, a skill from elsewhere.
- Versions: agent-orchestration 0.10.0, planning 0.8.0, session-discipline 0.11.0, verification 0.11.0, pau-skills
  0.14.0. No hook changed.

## 2026-10-19: the fifth pstack batch (overnight-run, engineering-principles, audit, mutate.sh, evaluator, hillclimb)

- `overnight-run` (new, agent-orchestration, adapted from pstack): runs one task unattended under a contract. Trust
  checks first, a finish condition a script checks on a clean tree, a fresh worktree, a control folder no turn can
  write, turns in `--permission-mode dontAsk` with one allow rule per command, an append-only decision log through
  `log.mjs` (outside the repository, guarded against spreadsheet formulas), an off switch and a resume note, and a
  morning audit by a fresh reviewer; the summary ends with an Attention section. It asks first when the agent starts
  it on its own.
- `engineering-principles` (new, planning, adapted from pstack): an index of eleven named principles (build the lever,
  explain the number, make operations idempotent, type system discipline, model the domain, minimize reader load,
  separate before serializing shared state, subtract before you add, migrate callers then delete, redesign from first
  principles, experience first), with the detail in `PRINCIPLES.md`; steer with a name, and a citation names the
  decision it changed. Read only.
- `retrospective`, `session-close`: the rules audit now scores CLAUDE.md bullets of 12 or fewer content words in
  `--check` with a word score, a candidate the agent confirms by reading the bullet, and reads skills synced from
  claude.ai, printed as `[synced skill]` with their path. Both stay out of the pairs report. The retrospective says
  what to do when `--check` cannot run.
- `mutation-test`: `mutate.sh` turns off Python's bytecode cache for its commands (a same-size mutation in the same
  second read SURVIVED), and restores by content: a command that sets the file's time, or a patch that keeps its size
  and time, can no longer leave the mutant behind a false RESTORED. It refuses a file with an edit git does not see,
  a skip-worktree or assume-unchanged file, and an absolute or `..` path, and reports a command that staged or
  committed the mutant.
- `evaluator`: a passing test counts as evidence only after its mutation check made it fail, and the `Mutation:`
  field records the defect, the command and CAUGHT, SURVIVED or NOT MUTATED.
- `hillclimb`: `decisions.mjs` writes a single quote in front of any `decision.tsv` cell a spreadsheet would read as
  a formula (the delta always starts with + or -), reads it back without the quote so old logs still read, and refuses
  a value that would not read back as typed.
- `which-skill`: routes for the two new skills; `overnight-run` joins the skills that ask first.
- `tests/context-budget.test.mjs`: the description total is 13,000 characters (was 12,000), by the owner's choice.
- Versions: agent-orchestration 0.9.0, planning 0.7.0, session-discipline 0.10.0, verification 0.10.1, pau-skills
  0.13.0. No hook changed; pau-skills-hooks stays at 0.2.0.

## 2026-10-18: the fourth pstack batch (retrospective, safe-merge, evaluator, improve-codebase-architecture, which-skill, small additions, CI)

- `retrospective`: a proposed edit must change what a future agent does, or it is dropped and shown as DROPPED; a user
  correction always goes on to the redundancy search; a new lens catches decisions that were right for the wrong
  reason; only the user's own corrections count; approval row by row; a DUPLICATE goes to a check, and a skill that did
  not start goes to its description at its source. The agent now reads short CLAUDE.md bullets itself, since the audit
  cannot see them. `session-close` and `handoff` use the same bar in their short retrospectives.
- `safe-merge`: before merging on an older review or evaluator verdict, compare patch ids
  (`git diff-tree -p --full-index` piped to `git patch-id --verbatim`); a different or missing id means the verdict is
  redone. Covers stacked, promotion and fork PRs.
- `evaluator`: evidence by change type (a CLI runs the real command, a parser runs a saved real input, storage reads the
  value back and, for the stored form, the raw value); a check that could not run is UNVERIFIED with `inconclusive:`;
  the output names the commit, base and patch id its verdict covers, and withholds the id on a dirty tree.
- `improve-codebase-architecture`: Explore screens for red flags for agent contributors, missing domain structure and
  reader load; a new step 4 (`EXECUTION.md`) carries out a chosen candidate only on an explicit ask, on a clean tree
  and its own branch: a characterization test proven able to fail, small green steps, callers migrated and the old
  path deleted in one wave. It stays off the confirm list because that ask is its gate.
- `which-skill`: a "fix a run that went wrong" table, check the project's state only when it changes the answer, route
  a skill missing from the tables by its description, and a checklist for wording a request.
- `methodology`: a wrong log entry is corrected by a superseding entry; a plateau is not a stop; a finish condition is
  never relaxed to end a run; every unattended run has a stop owned by the human, with a field in `PROJECT.md`.
- `parallel-worktrees`: a race shape (several attempts at one piece, the selection rule written first, its cost asked
  for); what worktrees do not separate; a check that no agent or watcher still uses a worktree before removing it.
- `handoff`: the handoff carries a resume rule and a cheap check per claim; the next session verifies instead of
  redoing, and reports a check that could not run as such.
- `flaky-test-hunt`: classifies a CI failure before treating it as flaky (fetch first, a stale base against the base CI
  tested, one diagnostic re-run, two identical failures end the hunt only when history agrees), and now also starts
  when a failed CI run is about to be retried.
- New hook `suppression-reason` (verification): tells the agent when an edit adds a lint or type-check suppression with
  no reason next to it. It never blocks. Turn it off with `"hooks": { "suppression-reason": false }`.
- CI runs `claude plugin validate . --strict` (Claude Code 2.1.302, Node 22, Linux) in a new `validate` job.
  `docs/ADDING-A-SKILL.md` step 8 gives a command that lists the plugins a change must bump, counting new files and
  moves (P1.2, P1.3).
- Minor bump for every skill plugin, the bundle and `pau-skills-hooks`.

## 2026-10-17: every skill loads on its own (P0.5)

- All 34 skills can now be started by the agent from your own words; `disable-model-invocation` is gone from every
  skill, and typing `/name` still works. Each description is a short list of the phrases that should start it: at
  most 400 characters, 12,000 for all of them (they were 18,298; now about 11,300).
- 13 skills ask first when the agent started them on its own, with the same paragraph in each: the ones that launch
  subagents or headless runs, commit, push or install with no other check, or change how the whole session works. A
  remark that only matches a description does not count as asking; a brief that names the skill does.
  `tests/confirm-step.test.mjs` keeps the list, the skills, the README and `which-skill` in step.
- In the descriptions of those skills, only phrases that ask for the work are quoted; remarks and questions are
  written as situations ("when versions are far behind"), so they do not count as asking.
- A skill can start another one directly where the step is part of the work you asked for, and offers it where it is
  a next step or the current skill is still read-only.
- `bug-fix` now says when it is worth loading: the cause is not obvious, a first fix did not hold, the bug came back or
  the fix is risky. An obvious one-line fix is done in the session without it.
- `which-skill` drops its typed and automatic lists; `scripts/new-skill.mjs` no longer writes the flag;
  `docs/ADDING-A-SKILL.md` step 2 describes the new rule.
- Minor bump for every skill plugin and the bundle; the hooks did not change.

## 2026-10-17: the third pstack batch (tdd, mutation-test, review-triage, lean-subagent-dev, rule-to-hook, codebase-oracle)

- `tdd`: "prefer no new test over a bad test" replaces "no test is too small" for fixes and small changes with no cheap
  test path; a two-edit check (break the behaviour: the test fails; change only the internals: it still passes) decides
  which tests to keep; expected values come from the requirement; a stored value read back counts as behaviour.
- `mutation-test`: `mutate.sh --refactor` checks that a pure refactor leaves the test green (KEPT or BROKE); the skill
  prefers a real past mistake from git history as the mutation, fed in with `git show -R`. The harness refuses an edit
  that deletes or empties the file (such as a reversed commit that added it), and BROKE says to read the failure
  before blaming the test.
- `review-triage`: "I would have done it differently" is treated as the usual false positive, nitpick gravity says when
  a review is only nits, and recurring findings can be recorded as learned patterns (candidate, recurring, strong) that
  never leave a reproduced failure, a must-fix or a security finding.
- `lean-subagent-dev`: an effort level per role in the budget table, no unconfirmed model names (a smaller model only
  on the user's yes), standing orders in every brief, no launch while a required brief field is empty, and no messages
  to a subagent just to check on it. Shares the new `TRIAGE.md`.
- `rule-to-hook`: picks the highest layer first (architecture, types, lint or CI check, test, prose) and keeps hooks
  for rules about what the agent does; every check names what to use instead; a ratchet for patterns already common,
  with a new `templates/ratchet.mjs` that runs from the repository root and lists exceptions for review; exceptions on
  the line with a reason, an expiry and an approver; each check proven on a real past mistake; a rule table pairing
  rules with enforcers.
- `codebase-oracle`: grades every answer with one of five evidence tiers (in a bundled `TIERS.md`), never takes the
  code as proof of its own intent, treats a guess in the question as one candidate, answers history questions from git
  and the pull request record first, and runs 2 to 4 read-only explorers for big questions.
- All six take ideas or text from pstack; NOTICE and `docs/ORIGINS.md` say what. The dash test now says what to use
  instead of a dash.
- Versions: pau-skills 0.10.0, verification 0.8.0, agent-orchestration 0.6.0, guards 0.5.0.

## 2026-10-17: config files with a byte order mark are honoured

- `hooks/lib/config.mjs` ignored a `.claude/pau-skills.json` that starts with a UTF-8 byte order mark (some Windows
  editors write one), so a hook could not be turned off. It now drops the mark before parsing. The same fix applies to
  `instructions-audit`, where the mark hid a rules file's `paths:` frontmatter and a `package.json`'s scripts, and to
  the plan file of `parallel-worktrees`, and to the `package.json` read by `audit.mjs --stale` in `retrospective` and
  `session-close`, which reported every `npm run` script as missing.
- Versions: pau-skills 0.9.2, pau-skills-hooks 0.1.1, session-discipline 0.7.2, verification 0.7.1,
  agent-orchestration 0.5.2, guards 0.4.1.

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
