# pau-skills

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Skills: 22](https://img.shields.io/badge/skills-22-informational)
![Hooks: 11](https://img.shields.io/badge/hooks-11-informational)
![Claude Code plugin marketplace](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-D97757)

The Claude Code skills, hooks and scripts I use every day, packaged as a plugin marketplace. I am Alvaro "Pau" Reis,
an AI engineer. They are for people who already use Claude Code on real projects and have noticed the same things I
have: agents report success when a file came out wrong, rules written in `CLAUDE.md` get broken anyway, and a session
that ends without a handoff costs the next one an hour.

Nothing here depends on a language or framework. The skills work in any repository, and the hooks are small Node.js
scripts with no dependencies and a test suite that proves each one can fail.

## Quick start

```bash
claude plugin marketplace add paureis/pau-skills
claude plugin install pau-skills@pau-skills
```

That installs everything. To take only part of it, install individual plugins instead (`session-discipline`,
`verification`, `agent-orchestration`, `guards`, `planning`). For Codex, Cursor and other agents, the skills alone
install with `npx skills@latest add paureis/pau-skills`.

Not sure where to start? Run `/pau-skills:which-skill` and describe what you are doing.

[docs/INSTALL.md](docs/INSTALL.md) has every install, update and removal command.
[docs/HOOKS.md](docs/HOOKS.md) explains how to turn any hook off.

## The idea

**A written rule that gets broken three times becomes a script, a hook or a gate.**

Most of what is here started as a sentence in a rules file. Each one was broken often enough, while it was already
written down, that I stopped rewriting the sentence and wrote code instead: a PreToolUse hook that blocks a shell
pattern, a harness that asserts the steps I kept getting wrong, a script that measures whether a new rule is just an
old one restated. The rules that are still sentences are in [docs/RULES.md](docs/RULES.md), and each one that has a
mechanism points to it. The `rule-to-hook` skill turns that habit into a process you can run on your own rules.

## Problems this fixes

### 1. "Done" when it is not done

The agent says the feature works. It never ran the tests, or the test it wrote cannot fail, or it made the suite
green by skipping the failing test.

- `verify-before-done` (hook) sends the agent back once if it changed code and ran no test, build or check afterwards.
- `test-tamper-guard` (hook) asks you before a test is skipped, focused or stripped of assertions.
- `tdd` builds one behaviour at a time, test first.
- `mutation-test` breaks the code on purpose to prove a test catches it.
- `evaluator` has a fresh agent, which did not build the change, grade it against its acceptance criteria.

### 2. Rules that are written down and still broken

`CLAUDE.md` grows by restating itself, and the rules that matter most are the ones broken under pressure.

- `rule-to-hook` turns a rule that keeps being broken into a hook with tests, step by step.
- `retrospective` turns a session's corrections into rule, memory or skill edits, gated by a script so nothing gets
  written twice.
- `claude-md-audit` finds the size, duplicates, contradictions, stale references and vague rules in your instruction
  files.

### 3. One command that cannot be undone

An agent that wants a clean slate reaches for `rm -rf`, `git reset --hard` or a force push, and the clean slate is
your work. An agent that wants a green commit reaches for `--no-verify`. An agent that wants a working demo pastes the
API key into the source.

- `destructive-guard` (hook) blocks deleting outside the project, force pushes to protected branches, discarding
  uncommitted work, `DROP DATABASE`, `terraform destroy` and similar.
- `secret-guard` (hook) blocks credentials being written into files.
- `no-verify-guard` (hook) blocks skipping git hooks and commit signing.
- `merge-guard` (hook) and `safe-merge` merge pull requests without closing the ones stacked on them.
- `inline-backtick-guard` (hook) blocks inline interpreter payloads that bash would silently rewrite.

### 4. Every session starts from zero

The new session does not know what the last one finished, which branch it is on, or what the user said before the
context was compacted.

- `roadmap` and `branch-context` (hooks) open every session with the current roadmap item and the git state.
- `compact-snapshot` (hook) saves your last messages, edited files and todo list before a compaction and hands them
  back after.
- `session-close` ends a session in a fixed order: retrospective, roadmap and log, handoff, commit.
- `handoff` writes a handoff the next session can resume from.

### 5. Building before the plan is decided

- `grill-me` interviews you one question at a time until every branch of the plan is decided.
- `to-prd` and `to-issues` turn the decided plan into a spec and vertical-slice issues.
- `codebase-oracle` answers questions about the code from evidence in the code, and says when it cannot.
- `improve-codebase-architecture` finds refactors that make modules deeper and easier to test.

### 6. Several agents in one repository

- `parallel-worktrees` splits work into independent pieces, one git worktree and branch per agent, then integrates
  them one at a time.
- `methodology` is an operating method where no agent certifies its own work.
- `no-idle` (hook) stops subagents from ending their turn waiting for something that will never wake them.

### 7. The careful work nobody wants to do

- `dependency-upgrade` plans and applies upgrades in any ecosystem, one major version at a time, on a green baseline.
- `dependency-security-audit` gives a ranked, actionable npm vulnerability and supply-chain report.
- `migration-review` checks a database migration for locks, downtime, data loss and a way back before it runs.
- `flaky-test-hunt` measures how often a test fails, finds the actual cause, and proves the fix.
- `ci-cost-and-cadence` decides how much CI to run and when, from measurements.

## Reference

Every skill runs as `/<plugin>:<skill>`, or `/pau-skills:<skill>` from the bundle. "Adapted" marks the skills
derived from [mattpocock/skills](https://github.com/mattpocock/skills); everything else is original.

### session-discipline

- **which-skill**: Recommends the skill or sequence of skills that fits your situation.
- **retrospective**: Turns a session's corrections into rule, memory or skill edits, gated by `audit.mjs`; `--stale`
  finds rules that cite files that are gone.
- **session-close**: Closes a session in a fixed order: clean tree, retrospective, roadmap and log, handoff, commit
  and push.
- **handoff**: Writes a handoff the next session can resume from, after a retrospective gate.
- **claude-md-audit**: Audits CLAUDE.md, AGENTS.md and similar files, with `scan.mjs` for size, duplicates, stale
  references and secrets, and proposes edits for approval.
- Hooks: **roadmap**, **branch-context**, **compact-snapshot**.

### verification

- **tdd** (adapted): Red-green-refactor in vertical slices, with mocking and refactoring rules.
- **mutation-test**: `mutate.sh` applies one mutation and checks by script that it applied, changed behaviour, and
  was restored.
- **evaluator**: A hostile evaluator in a forked context grades each contract assertion with reproducible evidence.
- **flaky-test-hunt**: Reproduces an intermittent failure with `repeat.mjs`, classifies the cause, and proves the
  fix with a measured failure rate.
- **migration-review**: Reviews a schema or data migration for locks, compatibility with running code, data safety
  and reversibility, for any migration tool.
- **ci-cost-and-cadence**: Measures where CI minutes go, compares five options with numbers, and builds the chosen
  one.
- Hooks: **test-tamper-guard**, **verify-before-done**.

### agent-orchestration

- **methodology**: Contracts, an evidence standard, an evaluator, convergence and two-file state, with templates.
- **codebase-oracle**: Answers questions about a codebase from evidence in it only; never guesses.
- **parallel-worktrees**: Runs independent pieces of work in separate git worktrees, with `worktrees.mjs` to check a
  plan for overlapping files and report every worktree's state.
- Hook: **no-idle**.

### guards

- **rule-to-hook**: Turns a rule that keeps being broken into a tested hook, with templates in JavaScript and Python.
- **safe-merge**: Merges a PR pinned to its head commit and deletes the branch only if no open PR is based on it.
- **dependency-upgrade**: Plans and applies dependency and toolchain upgrades in any ecosystem, step by step.
- **dependency-security-audit**: A ranked npm vulnerability and supply-chain audit, not an `npm audit` dump.
- Hooks: **secret-guard**, **destructive-guard**, **no-verify-guard**, **merge-guard**, **inline-backtick-guard**.

### planning

- **grill-me** (adapted): Interviews you one question at a time until every branch of a plan is decided.
- **to-prd** (adapted): Synthesizes the conversation into a PRD without re-interviewing.
- **to-issues** (adapted): Splits a plan into vertical-slice issues for any tracker.
- **improve-codebase-architecture** (adapted): Finds refactors that turn shallow modules into deep ones.

[docs/ORIGINS.md](docs/ORIGINS.md) records, for every piece, the problem that led to it and, for each adapted skill,
the upstream version it was compared against and what this version changes, taken from a diff.

### I also use, unmodified

My copies of these differ from upstream only by being shorter, so I do not republish them. Use the originals:

- [grill-with-docs](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) by Matt Pocock
- [prototype](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype) by Matt Pocock

## How the pieces fit into a session

```mermaid
flowchart TD
    A([Session starts]) --> B[roadmap and branch-context hooks:<br/>current item, next item, git state]
    B --> C{Is the next step decided?}
    C -- no --> D[grill-me, then to-prd and to-issues]
    C -- yes --> E[Read-only agents first:<br/>codebase-oracle, inventory, audit]
    D --> E
    E --> F[Builder agents implement with tdd,<br/>in parallel-worktrees when pieces are independent]
    F -. every launch .-> G[no-idle hook]
    F -. every command and edit .-> H[guards: destructive, secret,<br/>no-verify, merge, backtick, test-tamper]
    F --> I[Verify: tests, then mutation-test<br/>on every guard the change relies on]
    I -. on stop .-> V[verify-before-done hook]
    I --> J[evaluator in a forked context,<br/>until two clean rounds]
    J -- defects --> F
    J -- holds --> K[safe-merge]
    K --> L[session-close: retrospective with audit.mjs,<br/>roadmap and log, handoff, commit]
    L --> M([Next session reads the handoff])
```

## How I use these day to day

A session starts with the roadmap and git summary in context, and with the handoff from the last session if there is
one. I work one roadmap item at a time. Before anything is built, read-only agents report on what already exists and
what the change will touch; the design discussion starts from their reports, not the other way round. When the plan
has open decisions, `grill-me` settles them one question at a time.

Implementation goes to subagents. The no-idle hook means I no longer have to remember to tell each one not to sit
waiting on a background task, and the guards stop the shell mistakes I made most often. Nothing counts as done
because a builder said so: each guard gets a mutation run through `mutate.sh`, and an evaluator that has not seen the
build attacks it.

When the work is done or the context is running out, `session-close` runs the retrospective (whose audit usually tells
me the lesson is already written somewhere, and the fix is a hook rather than another sentence), updates the roadmap
and the log, writes the handoff, and commits.

## Development

```bash
npm test                          # node --test, no dependencies
npm run scrub                     # fails on private names, account ids, machine paths or untranslated text
node scripts/build-bundle.mjs     # regenerate the pau-skills bundle entry after changing any hooks.json
claude plugin validate . --strict # the marketplace; add a plugin path to check one plugin
```

To bring a new skill into the repository, start with `node scripts/new-skill.mjs <plugin> <skill-name>` and follow
[docs/ADDING-A-SKILL.md](docs/ADDING-A-SKILL.md).

## Credits

- The planning skills and `tdd` are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) by Matt
  Pocock, under the MIT License. The upstream notice is in [NOTICE](NOTICE). The layout of this README, organised
  around the problems each piece fixes, also follows his.
- Everything else is mine, under the MIT License ([LICENSE](LICENSE)).
