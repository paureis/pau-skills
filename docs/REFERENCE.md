# Reference

Back to the [README](../README.md).

Every skill is a folder in [`skills/`](../skills), grouped by plugin, and every hook is a script in [`hooks/`](../hooks).
Each name below links to the file itself. A skill runs as `/<plugin>:<skill>`, or `/pau-skills:<skill>` from the
bundle. "Adapted" marks the skills
derived from [mattpocock/skills](https://github.com/mattpocock/skills) or from
[pstack](https://github.com/cursor/plugins/tree/main/pstack); everything else is original.

## session-discipline

- **[which-skill](../skills/session-discipline/which-skill/SKILL.md)**: Recommends the skill or sequence of skills that fits your situation, and what
  to do about a run that went wrong.
- **[retrospective](../skills/session-discipline/retrospective/SKILL.md)**: Turns a session's corrections into rule, memory or skill edits, gated by `audit.mjs`; drops
  an edit that would not change what a future agent does, and catches decisions that were right for the wrong reason;
  `--stale` finds rules that cite files that are gone.
- **[session-close](../skills/session-discipline/session-close/SKILL.md)**: Closes a session in a fixed order: clean tree, retrospective, roadmap and log, handoff, commit
  and push.
- **[handoff](../skills/session-discipline/handoff/SKILL.md)**: Writes a handoff the next session can resume from, after a retrospective gate, with a
  cheap check for every claim so the next session verifies instead of redoing.
- **[instructions-audit](../skills/session-discipline/instructions-audit/SKILL.md)**: Audits CLAUDE.md, AGENTS.md and similar files, with `scan.mjs` for size, duplicates, stale
  references and secrets, and proposes edits for approval.
- **[project-setup](../skills/session-discipline/project-setup/SKILL.md)**: Interviews you about how you want to work, then writes the project CLAUDE.md and,
  with a separate yes, your personal preferences, in your language. Written for people new to Claude Code. When the
  project handles money, sign-in, a database, server input or secrets, it offers the matching production rules from
  its `PRODUCTION-RULES.md` for the project CLAUDE.md.
- Hooks: [`roadmap`](../hooks/session-discipline/roadmap.mjs), [`branch-context`](../hooks/session-discipline/branch-context.mjs), [`compact-snapshot`](../hooks/session-discipline/compact-snapshot.mjs).

## verification

- **[tdd](../skills/verification/tdd/SKILL.md)** (adapted): Red-green-refactor in vertical slices, with mocking and refactoring rules, a
  two-edit check for which tests to keep, and "prefer no new test over a bad test" for small fixes.
- **[mutation-test](../skills/verification/mutation-test/SKILL.md)**: `mutate.sh` applies one mutation (a real past fix reversed, when there
  is one) and checks by script that it applied, changed behaviour, and was restored; `--refactor` checks that a pure
  refactor leaves the test green.
- **[evaluator](../skills/verification/evaluator/SKILL.md)**: A hostile evaluator in a forked context grades each contract assertion with reproducible evidence of
  the right kind for the change, marks a check that could not run as inconclusive, and names the patch its verdict
  covers.
- **[flaky-test-hunt](../skills/verification/flaky-test-hunt/SKILL.md)**: First checks whether a CI failure is a flake at all (a stale base, a failure that
  repeats), then reproduces an intermittent failure with `repeat.mjs`, classifies the cause, and proves the fix with a
  measured failure rate.
- **[migration-review](../skills/verification/migration-review/SKILL.md)**: Reviews a schema or data migration for locks, compatibility with running code, data safety
  and reversibility, for any migration tool.
- **[ci-cost-and-cadence](../skills/verification/ci-cost-and-cadence/SKILL.md)**: Measures where CI minutes go, compares five options with numbers, and builds the chosen
  one.
- **[review-triage](../skills/verification/review-triage/SKILL.md)** (adapted): Decides which review findings are worth fixing (must
  fix, fix if cheap, leave), with a test per fix and one review round and one fix round, says when a review is only
  nits, and records recurring findings as learned patterns; `review-scope.mjs` flags a fix with no test, in risky code
  or outside the change.
- **[bug-fix](../skills/verification/bug-fix/SKILL.md)** (adapted): Reproduces a bug twice on the real surface, tests hypotheses with
  runtime evidence, fixes the first wrong decision instead of guarding the symptom, commits the failing repro before
  the fix, and proves what the change cannot break.
- **[verify-app](../skills/verification/verify-app/SKILL.md)** (adapted): Generates a project skill, `.claude/skills/verify-<app>/`, that
  launches the real app, drives it like a user, keeps evidence that survives cleanup and cleans up only what it
  started, with a feature map; each feature file says how to force its loading, empty and error states, and the skill
  carries a recipe that measures a skeleton against the loaded screen and reads the layout-shift score;
  `check-map.mjs` checks it, and `maintain` keeps it in step with the app.
- **[hillclimb](../skills/verification/hillclimb/SKILL.md)** (adapted): Improves one metric (time, size, memory, a score)
  step by step: a frozen harness proven sensitive with a deliberate regression, a stop predicate with a minimum number
  of attempts, one change and one measurement per attempt (keep or revert), a commit per win, and an append-only
  decision log outside the repository kept by `decisions.mjs`, with a checklist run before any number is reported.
- **[skill-eval](../skills/verification/skill-eval/SKILL.md)** (adapted): Checks whether a change to a skill or prompt
  changes what an agent does: each variant runs several times as a headless `claude -p` session in a neutral folder
  that holds only that variant, runs are graded on what they did, and a reviewer with no tools scores them blind next
  to your own blind read; `skill-eval.mjs` sets up the folders, refuses leaks and makes the blind copy.
- **[launch-readiness](../skills/verification/launch-readiness/SKILL.md)**: An honest go or no-go for the stage an app is
  entering (private beta, paying customers, enterprise, regulated data). The profile is confirmed first, every row has
  `file:line` or command evidence, security suspects are confirmed by probe tests, what code cannot show goes through
  a questionnaire with expiry, and `READINESS.md` rechecks only rows whose evidence changed; `ledger.mjs` keeps it.
  When a gap closes, it offers the production rule that keeps it closed.
- Hooks: [`test-tamper-guard`](../hooks/verification/test-tamper-guard.mjs), [`suppression-reason`](../hooks/verification/suppression-reason.mjs), [`verify-before-done`](../hooks/verification/verify-before-done.mjs).

## agent-orchestration

- **[methodology](../skills/agent-orchestration/methodology/SKILL.md)**: Contracts, an evidence standard, an evaluator, convergence, a stop for every
  unattended run and two-file state, with templates.
- **[codebase-oracle](../skills/agent-orchestration/codebase-oracle/SKILL.md)** (adapted): Answers questions about a codebase from the
  code and its history, grading each answer's evidence in five tiers, with read-only explorers for big questions;
  never presents a guess as a finding.
- **[parallel-worktrees](../skills/agent-orchestration/parallel-worktrees/SKILL.md)**: Runs independent pieces of work in separate git worktrees, or races several
  attempts at one piece and keeps the best, with `worktrees.mjs` to check a plan for overlapping files and report every
  worktree's state.
- **[lean-subagent-dev](../skills/agent-orchestration/lean-subagent-dev/SKILL.md)** (adapted): A way of working for a whole session:
  one subagent at a time with a written brief and standing orders, the main session checks the work itself and triages
  the review, and the usage budget sets how much to delegate and each role's effort.
- **[arena](../skills/agent-orchestration/arena/SKILL.md)** (adapted): Runs several candidate subagents at one task, each with a
  different brief, has a fresh judge score them blind against a rubric they never saw, then picks a base and grafts
  the best parts by hand; `arena.mjs` scaffolds the folders and makes the blind copy.
- **[overnight-run](../skills/agent-orchestration/overnight-run/SKILL.md)** (adapted): Runs one task unattended under a
  contract: trust checks before the loop, a finish condition a script checks, a fresh worktree, an append-only
  decision log kept outside the repository by `log.mjs`, a control folder no turn can write, an off switch and a
  resume note, and a morning audit by a fresh reviewer; the summary ends with an Attention section.
- **[geppetto](../skills/agent-orchestration/geppetto/SKILL.md)**: Designs, installs, audits and updates a project's
  Claude Code agent files, with a starter roster (eng-lead, builder, reviewer, writer, sweeper) that all carry one
  covenant (builder and reviewer also carry the production rules from `PRODUCTION-RULES.md`), a designer template
  that Create fills with the paths of the project's design system (it extends a keyframe into further screens with
  only the system's tokens and lists every value it invents), and `check-agents.mjs`, which finds what makes Claude
  Code skip an agent or quietly change its tools. Asks before every write.
- Hook: [`no-idle`](../hooks/agent-orchestration/no-idle.mjs).

## guards

- **[rule-to-hook](../skills/guards/rule-to-hook/SKILL.md)** (adapted): Turns a rule that keeps being broken into a check at the
  highest layer that holds it (architecture, types, lint or CI with a ratchet, a test, or a hook for what the agent
  does), tested, proven on a past mistake and recorded in a rule table, with hook templates in JavaScript and Python
  and `ratchet.mjs` for patterns already common. For one of the five production rules, it uses the checker that
  `PRODUCTION-RULES.md` names for the project's ecosystem, one rule per run.
- **[safe-merge](../skills/guards/safe-merge/SKILL.md)**: Merges a PR pinned to its head commit and deletes the branch only if no open PR is based on it;
  before merging on an older review or evaluator verdict, compares patch ids to see whether the verdict still holds.
- **[dependency-upgrade](../skills/guards/dependency-upgrade/SKILL.md)**: Plans and applies dependency and toolchain upgrades in any ecosystem, step by step.
- **[dependency-security-audit](../skills/guards/dependency-security-audit/SKILL.md)**: A ranked vulnerability, reachability and supply-chain audit for any ecosystem and
  container image, built on native audit tools and OSV-based scanners, not a raw scanner dump.
- Hooks: [`secret-guard`](../hooks/guards/secret-guard.mjs), [`file-size-guard`](../hooks/guards/file-size-guard.mjs), [`destructive-guard`](../hooks/guards/destructive-guard.mjs), [`no-verify-guard`](../hooks/guards/no-verify-guard.mjs), [`merge-guard`](../hooks/guards/merge-guard.mjs), [`inline-backtick-guard`](../hooks/guards/block-inline-backtick-payload.mjs).

## planning

- **[grill-me](../skills/planning/grill-me/SKILL.md)** (adapted): Interviews you one question at a time until every branch of a plan is decided.
- **[to-prd](../skills/planning/to-prd/SKILL.md)** (adapted): Synthesizes the conversation into a PRD without re-interviewing.
- **[to-issues](../skills/planning/to-issues/SKILL.md)** (adapted): Splits a plan into vertical-slice issues for any tracker.
- **[improve-codebase-architecture](../skills/planning/improve-codebase-architecture/SKILL.md)** (adapted): Finds refactors that turn shallow modules into deep ones,
  screened for red flags for agent contributors and for reader load, talks the chosen one through, and on request
  carries it out behind a characterization test, on its own branch.
- **[architect](../skills/planning/architect/SKILL.md)** (adapted): Sketches types and signatures with not-implemented bodies before
  writing code, compares at least two shapes against red flags for agent contributors, then implements against the
  sketch test first and scraps it when deviations repeat.
- **[brainstorm](../skills/planning/brainstorm/SKILL.md)**: Widens the options before a decision is settled: frames the
  goal in at most three questions, shows 8 to 12 options from named lenses in 3 or 4 clusters with its own picks
  marked, takes one round where you accept them with an "ok" or pick your own, then converges on 3 or 4 rated without
  a score, with a premortem each, and a short summary for `grill-me`.
- **[sharpen](../skills/planning/sharpen/SKILL.md)** (adapted): Before a task, restates the goal and the problem behind
  it, asks how an expert would check the result, and confirms in six lines before working.
- **[agent-friendly-audit](../skills/planning/agent-friendly-audit/SKILL.md)** (adapted): Mines review comments, fix and
  revert commits, this project's transcripts and instruction files for the mistakes agents repeat, and proposes a fix
  for each at the highest layer (architecture, types, lint, test, prose), proven on a past instance; `mine.mjs` does
  the read-only mining, with redaction. Writes nothing without your yes.
- **[engineering-principles](../skills/planning/engineering-principles/SKILL.md)** (adapted): An index of eleven named
  engineering principles (build the lever, model the domain, subtract before you add and more), each with when it
  applies, its rule and the sign you skipped it, and a reference file with the detail; steer with a name, and a
  citation must name the decision it changed.
