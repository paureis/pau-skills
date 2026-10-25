# pau-skills

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Skills: 38](https://img.shields.io/badge/skills-38-informational)
![Hooks: 13](https://img.shields.io/badge/hooks-13-informational)
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

That installs everything. If your skills come from your claude.ai account instead (they then sync to the terminal,
the desktop app and the web), install only the hooks: `claude plugin install pau-skills-hooks@pau-skills`
([docs/INSTALL.md](docs/INSTALL.md) explains both). To take only part of it, install individual plugins instead (`session-discipline`,
`verification`, `agent-orchestration`, `guards`, `planning`), or copy a single skill's folder: every skill works on its
own, without the plugin or any other skill. For Codex, Cursor and other agents, the skills alone
install with `npx skills@latest add paureis/pau-skills`.

Not sure where to start? Run `/pau-skills:which-skill` and describe what you are doing.

[docs/INSTALL.md](docs/INSTALL.md) has every install, update and removal command.
[hooks/README.md](hooks/README.md) explains every hook and how to turn any of them off.

## What is where

```
skills/        every skill, one folder each, grouped by plugin
  session-discipline/   verification/   agent-orchestration/   guards/   planning/
hooks/         every hook script, grouped the same way, with the shared code in lib/
docs/          install guide, origins of each piece, the rules that are still sentences, how to add a skill
tests/         node:test suites for every script and hook (npm test)
scripts/       repository tooling: the marketplace builder, the skill scaffolder, the scrub check
.claude-plugin/marketplace.json   the plugin definitions Claude Code reads
```

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
- `suppression-reason` (hook) tells the agent when it adds a lint or type-check suppression with no reason next to it.
- `tdd` builds one behaviour at a time, test first, and keeps a test only when it fails if the behaviour breaks and
  still passes after a pure refactor.
- `mutation-test` breaks the code on purpose to prove a test catches it, preferring a real past mistake from git
  history, and checks that a pure refactor leaves the test green.
- `evaluator` has a fresh agent, which did not build the change, grade it against its acceptance criteria.
- `verify-app` writes the project's own recipe for starting the real app and proving a change in it, with evidence.
- `launch-readiness` says whether an app built mostly by agents is ready for the stage it is entering, from private
  beta to paying customers, enterprise buyers or regulated data, with evidence for every row, probe tests for the
  security suspects, and a ledger that rechecks only what changed on later runs. When it closes a gap, it offers
  the production rule that keeps the gap from coming back.
- `bug-fix` finds the actual cause of a bug from runtime evidence and ships only the change that evidence justifies,
  when the cause is not obvious or a first fix did not hold.
- `hillclimb` makes a number better (run time, size, memory, a score) one measured change at a time, on a harness
  proven to notice a regression, and claims no win it did not measure.

### 2. Rules that are written down and still broken

`CLAUDE.md` grows by restating itself, and the rules that matter most are the ones broken under pressure.

- `rule-to-hook` turns a rule that keeps being broken into a tested check at the highest layer that holds it, often a
  hook, step by step, with a ratchet when the pattern is already common. For the five production rules it starts
  from the checker each ecosystem already has.
- `retrospective` turns a session's corrections into rule, memory or skill edits, gated by a script so nothing gets
  written twice.
- `instructions-audit` finds the size, duplicates, contradictions, stale references and vague rules in your instruction
  files.
- `agent-friendly-audit` mines review comments, fix commits, transcripts and instruction files for the mistakes agents
  repeat, and proposes a fix for each at the highest layer it can live in (architecture, types, a lint or CI check, a
  test, then prose), proven on a past instance.
- `file-size-guard` (hook) blocks a change that grows a file past 5,000 tokens, the file an agent keeps appending to,
  and says how to split it.
- `skill-eval` checks whether a change to a skill or prompt changes what the agent actually does, with blind runs.

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

- `sharpen` restates a task in its own words, with the problem behind it and one outside check, and confirms before
  starting.
- `brainstorm` widens the options before `grill-me` narrows them, so the first idea is not the only one considered.
- `grill-me` interviews you one question at a time until every branch of the plan is decided.
- `to-prd` and `to-issues` turn the decided plan into a spec and vertical-slice issues.
- `codebase-oracle` answers questions about the code from the code and its history, and labels how strong the
  evidence is for each answer.
- `improve-codebase-architecture` finds refactors that make modules deeper and easier to test, and carries one out
  behind a characterization test when you ask.
- `architect` sketches the types and signatures in two different shapes before any code is written, and builds
  against the one that survives the red flags.
- `engineering-principles` gives a name to each rule a design or code decision is made by ("apply build the lever"),
  so one phrase steers the work and every citation says which decision it changed.

### 6. Several agents in one repository

- `parallel-worktrees` splits work into independent pieces, one git worktree and branch per agent, then integrates
  them one at a time.
- `methodology` is an operating method where no agent certifies its own work.
- `arena` runs several subagents at one task with different briefs, and a blind judge helps pick and combine the
  results.
- `lean-subagent-dev` is the light version for a whole session: one subagent at a time with a written brief, and the
  main session checks its work itself. It asks how much usage room you have and delegates less when it is tight,
  because a subagent costs more usage in total, not less. Every brief carries the same standing orders, and no
  subagent starts while a field of its brief is empty.
- `overnight-run` lets an agent work while you are away without waking up to hours of motion and no way to tell what
  it did: it starts only after trust checks, stops on a check a script runs, logs every decision, and has a fresh
  reviewer audit the log against the transcript before you read the summary.
- `geppetto` designs, installs and audits a project's agent files, with a starter roster (`eng-lead` plans and
  dispatches without writing code, `builder`, `reviewer`, `writer`, `sweeper`; `builder` and `reviewer` follow five
  production rules), a `designer` that Create makes from your design system in code (it extends one finished screen
  with only your tokens and lists every value it had to invent), and a check for the mistakes that make Claude Code
  skip an agent or quietly change its tools.
- `no-idle` (hook) stops subagents from ending their turn waiting for something that will never wake them.

### 7. A review that never ends

An AI review can always find one more thing, and each fix can bring a new bug, so the review and fix loop does not stop
by itself. Half the findings are preferences, and the fix for a minor one lands in the code where a mistake costs most.

- `review-triage` keeps only findings that name a failure, weighs the risk of each fix as well as the problem, and
  sorts them into must fix, fix if cheap, or leave. Every fix gets a test that fails without it, the second look covers
  only the fix, and there is one review round and one fix round. It works for any review, human or AI. When a review
  is only nits, it says the change is probably fine instead of asking for another round.
- `lean-subagent-dev` uses the same method for the review of each subagent's work.

### 8. The careful work nobody wants to do

- `dependency-upgrade` plans and applies upgrades in any ecosystem, one major version at a time, on a green baseline.
- `dependency-security-audit` gives a ranked vulnerability, reachability and supply-chain report for any ecosystem
  and for container images.
- `migration-review` checks a database migration for locks, downtime, data loss and a way back before it runs.
- `flaky-test-hunt` measures how often a test fails, finds the actual cause, and proves the fix.
- `ci-cost-and-cadence` decides how much CI to run and when, from measurements.

### 9. Starting with Claude Code for the first time

Someone who knows Claude from the browser opens Claude Code in their project and does not know what to ask, what it
will change, or how to make it remember how they like to work.

- `project-setup` introduces itself and asks whether to start, then reads the project and asks about ten short
  questions one at a time (Learn, Build or Mix; how much freedom Claude gets; what "done" means), shows the
  CLAUDE.md it wants to write, and writes nothing without a yes.
  When the project handles money, sign-in, a database, server input or secrets, it offers short production rules
  for those (money as integers, validation on the server, parameterized queries, the user from the session, secrets
  out of the code), only the ones that apply. It ends with a cheat sheet for the desktop app, terminal or editor,
  and a first small task. It works on its own,
  without the rest of this marketplace.

## What loads on its own

Every skill loads on its own: the agent can start it when your words fit its description ("let's brainstorm options
for this", "wrap up this session", "is this test any good"), and you can still type any of them as
`/pau-skills:<skill>` or `/<plugin>:<skill>`. Claude Code puts every description into the context of every session,
so each one is a short list of the phrases that should start it. `tests/context-budget.test.mjs` holds each
description to 400 characters and all of them to 14,000 together.

Some skills cost something when they run, and nothing else in them stops for your yes first: they launch subagents
or headless runs, commit, push or install with no other check, or change how the whole session works. When the agent
starts one of these on its own, without you asking for what it does, it first says in one or two lines what it will
do and what it will cost, and waits for your yes. A remark that only matches a description ("the code is getting
messy") does not count as asking.

- `arena`, `codebase-oracle` (big questions only), `overnight-run`, `parallel-worktrees`, `agent-friendly-audit`,
  `hillclimb`, `skill-eval`, `verify-app`;
- `dependency-upgrade`, `rule-to-hook`, `architect`, `session-close`;
- `lean-subagent-dev`, `methodology`.

`tests/confirm-step.test.mjs` keeps this list and the skills in step.
The other skills either cost little or already ask before they write (for example `retrospective` and `to-issues`
show you their edits or issues and wait).

## Reference

Every skill and hook, plugin by plugin, with a link to each file: [docs/REFERENCE.md](docs/REFERENCE.md).

[docs/ORIGINS.md](docs/ORIGINS.md) records, for every piece, the problem that led to it and, for each adapted skill,
the upstream version it was compared against and what this version changes, taken from a diff.

### I also use, unmodified

My copies of these differ from upstream only by being shorter, or I use them exactly as published, so I do not
republish them. Use the originals:

- [grill-with-docs](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) by Matt Pocock
- [prototype](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype) by Matt Pocock

### Built from upstream, with additions

- [html-plan](https://github.com/anthropics/claude-plugins-community/tree/06ec7b6a0a82bdc4bec44bd82d4368c42f20d7c1/html-plan)
  by Thariq Shihipar: writes a plan as one interactive HTML page with the decisions placed on the claims they change.
  `architect`, `to-prd` and `grill-me` offer it when it is installed. Its `plugin.json` says MIT; the repository's root
  LICENSE is Apache 2.0. No upstream file is kept here: `scripts/pack-html-plan.mjs` builds the zip I upload from that
  commit plus three additions (the Mist theme, a fix for code line numbers, and a Send to Claude button in the Respond
  sheet). See [scripts/html-plan/README.md](scripts/html-plan/README.md).

## How the pieces fit into a session

A diagram of a session and how I use these day to day: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Development

```bash
npm test                          # node --test, no dependencies
npm run scrub                     # fails on private names, account ids, machine paths or untranslated text
node scripts/build-marketplace.mjs  # regenerate marketplace.json after changing a hooks.json or a plugin folder
claude plugin validate . --strict # the marketplace; add a plugin path to check one plugin
npm run pack-skills -- <skill>    # dist/<skill>.zip for upload to claude.ai; --since <ref> or --all
```

To bring a new skill into the repository, start with `node scripts/new-skill.mjs <plugin> <skill-name>` and follow
[docs/ADDING-A-SKILL.md](docs/ADDING-A-SKILL.md).

## Credits

- The planning skills and `tdd` are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) by Matt
  Pocock, under the MIT License. The upstream notice is in [NOTICE](NOTICE). The layout of this README, organised
  around the problems each piece fixes, also follows his.
- Much of this repository grew out of [pstack](https://github.com/cursor/plugins/tree/main/pstack), the skill set of
  Lauren Tan (poteto), published in Cursor's plugin repository under the MIT License. Its skills and playbooks were
  written for Cursor; the versions here are rewritten for Claude Code and generalised, and
  [docs/ORIGINS.md](docs/ORIGINS.md) records what each one changes.
  - Adapted from it, sharing its text or structure: `arena`, `architect`, `bug-fix`, `verify-app`, `hillclimb`,
    `skill-eval`, `agent-friendly-audit`, `sharpen`, `codebase-oracle`, `overnight-run` and
    `engineering-principles`.
  - Taking parts of their text from it: `tdd`, `review-triage`, `lean-subagent-dev`, `rule-to-hook` and
    `improve-codebase-architecture`.
  - Taking ideas from it, in new words: `retrospective`, `handoff`, `which-skill`, `mutation-test`, `evaluator`,
    `flaky-test-hunt`, `methodology`, `parallel-worktrees`, `safe-merge`, `brainstorm` and the `suppression-reason`
    hook.
  - The plan behind five batches of work in [docs/BACKLOG.md](docs/BACKLOG.md), the context budget and several of
    its rules also come from reading it. The upstream notice is in [NOTICE](NOTICE).
- Everything else is mine, under the MIT License ([LICENSE](LICENSE)).
