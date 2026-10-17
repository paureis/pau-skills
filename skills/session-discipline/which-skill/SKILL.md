---
name: which-skill
description: "Recommend which pau-skills skill, or sequence of skills, fits the user's situation (including the ones the user starts by typing /name), and explain what the installed hooks already do. Use when the user asks 'which skill should I use', 'what can these skills do', 'where do I start', 'is there a skill for this', 'help me pick', or seems unsure how to approach a task."
---

# Which Skill

A router over every skill in this marketplace. Read the user's situation, pick the smallest set of skills that fits,
and say in what order to run them. Do not run them yourself unless the user asks, and then only the ones that start
on their own (see below).

## How to answer

1. **Find out what the user is trying to do**, in one sentence. If it is unclear, ask one question, not five.
2. **Match it to a flow below.** Most work follows the main flow; problems come in through an on-ramp.
3. **Recommend one starting skill** with its full invocation, then the next one or two after it. Explain in a line
   why each one fits this situation, not what it does in general.
4. **Check it is installed.** Skills are namespaced by plugin: `/verification:tdd` from the individual plugin, or
   `/pau-skills:tdd` from the bundle. If the skill's plugin is missing, give the install command
   (`claude plugin install <plugin>@pau-skills`).
5. **Mention a hook only if it matters here**, for example that `verify-before-done` will send the agent back if it
   claims to be done without running checks.

Keep the answer short. A list of every skill is not an answer.

## Which skills start on their own

- **Start on their own** when the situation fits, so the agent may run them: `which-skill`, `tdd`, `bug-fix`,
  `verify-app`, `review-triage`, `evaluator`, `mutation-test`, `codebase-oracle`, `migration-review`,
  `flaky-test-hunt`, `dependency-security-audit`, `safe-merge`.
- **Typed by the user**: every other skill below. Their descriptions are not in the agent's context and the agent
  cannot start them, so give the exact command to type, for example `/pau-skills:grill-me`.

## Starting out

New to Claude Code, or starting in a new repository? **`project-setup`** (session-discipline) interviews the user,
writes the project CLAUDE.md, and ends with a first task. It needs no other skill.

## The main flow: from an idea to merged work

1. **`grill-me`** (planning). Settle every open decision before anything is built, one question at a time.
   Start here whenever the user has an idea that is not fully decided.
2. **`to-prd`** (planning). Turn the decided conversation into a written spec, without interviewing again.
3. **`to-issues`** (planning). Split the spec into vertical slices that can each be built and verified alone.
4. **Build each slice with `tdd`** (verification): red, green, refactor, one behaviour at a time.
   - A new interface, module layout or data model? **`architect`** (planning, typed: `/architect`) sketches two
     shapes before code, then builds against the one that survives.
   - Unsure which of several approaches is best? **`arena`** (agent-orchestration, typed: `/arena`) has several
     subagents try it with different briefs and a blind judge help pick.
   - Several slices that touch different files? **`parallel-worktrees`** (agent-orchestration) runs them at the same
     time, each agent in its own git worktree, then integrates them one by one.
   - A large effort run by several agents? **`methodology`** (agent-orchestration) gives the operating rules:
     contracts, evidence, and no agent certifying its own work.
   - Day-to-day work with subagents, or usage running low? **`lean-subagent-dev`** (agent-orchestration), run at
     the start of the session: one subagent at a time with a brief, the main session checks the work, and the usage
     budget sets how much to delegate.
5. **Prove it works.** **`mutation-test`** (verification) shows each important test can fail. **`evaluator`**
   (verification) has a fresh agent that did not build the change attack it, assertion by assertion.
   **`review-triage`** (verification) decides which review findings to fix and stops after one fix round.
   **`verify-app`** (verification) writes the project's own recipe for launching the real app and proving a change in
   it, with evidence; run it with `maintain` when the app has changed.
6. **`safe-merge`** (guards). Merge the PR pinned to its head commit, without closing PRs stacked on it.
7. **`session-close`** (session-discipline). End in a fixed order: retrospective, roadmap and log, handoff, commit.
   **`handoff`** alone writes the handoff when the session is ending mid-work.

## On-ramps: a problem that generates work

| The user says or has | Start with | Then |
|---|---|---|
| "This test fails sometimes", an intermittent CI failure | `flaky-test-hunt` (verification) | `tdd` for the regression test |
| A database migration about to run | `migration-review` (verification) | fix, then review again |
| Outdated dependencies, a framework major version to adopt | `dependency-upgrade` (guards) | `dependency-security-audit` for known risk |
| A CVE announcement, "are we vulnerable", "is this package safe" | `dependency-security-audit` (guards) | `dependency-upgrade` to apply fixes |
| CI is slow or expensive, "how much CI should we run" | `ci-cost-and-cadence` (verification) | |
| Review comments to work through, "which of these should I fix", a review loop that keeps going | `review-triage` (verification) | |
| A bug: wrong output, a crash, "this is broken", "fix this bug" (happens every time) | `bug-fix` (verification) | `evaluator` to attack the fix |
| "Verify it in the app", "how can an agent test this app", no scripted way to drive the app | `verify-app` (verification) | `evaluator` cites its drives as evidence |
| A question about how the codebase works | `codebase-oracle` (agent-orchestration) | `grill-me` if it leads to a change |
| "The code is getting messy", hard-to-test modules | `improve-codebase-architecture` (planning) | `grill-me` on the candidate picked |

## Improving the agent's environment

These change how future sessions go, not the product code.

- **`retrospective`** (session-discipline): after a session with corrections, turn them into rule, memory or skill
  edits, with a gate that stops the rule files from repeating themselves.
- **`claude-md-audit`** (session-discipline): review CLAUDE.md, AGENTS.md and similar files for size, duplicates,
  contradictions, stale references and vague rules.
- **`rule-to-hook`** (guards): a rule that keeps being broken becomes a hook with tests, instead of another sentence.
  The natural next step when `retrospective` or `claude-md-audit` finds a rule that is already written down and
  still ignored.

## What runs without asking

Hooks act on every session where their plugin is installed. Each can be turned off in `.claude/pau-skills.json`
(see hooks/README.md in the repository).

| Hook | When it acts |
|---|---|
| `roadmap`, `branch-context` | Session start: roadmap position, git branch and working-tree state |
| `compact-snapshot` | Before and after a compaction: keeps your last messages, edited files and todos |
| `secret-guard` | Blocks a credential being written into a file |
| `destructive-guard` | Blocks commands that destroy work or data for good |
| `no-verify-guard` | Blocks skipping git hooks or commit signing |
| `merge-guard`, `inline-backtick-guard` | Block a raw `gh pr merge` and backticks in inline interpreter payloads |
| `test-tamper-guard` | Asks before a test is skipped, focused or loses assertions |
| `verify-before-done` | Sends the agent back once if it changed code and ran no checks |
| `no-idle` | Tells every subagent never to end its turn waiting |

## Picking between close options

- **`grill-me` or `codebase-oracle`?** `grill-me` settles decisions that need the user's judgment.
  `codebase-oracle` answers questions the code can answer. When a plan has both kinds, run the oracle first so the
  interview only asks what the code cannot tell.
- **`evaluator` or `mutation-test`?** `mutation-test` checks one test or guard can fail. `evaluator` checks the
  whole change against its acceptance criteria. Use both on anything that guards security or money.
- **`evaluator` or `review-triage`?** `evaluator` grades a change against its contract until two rounds are clean.
  `review-triage` decides which findings from any review are worth fixing, with one fix round. A failed contract
  assertion is a must-fix in triage, so they work together.
- **`lean-subagent-dev`, `parallel-worktrees` or `methodology`?** `lean-subagent-dev` runs one subagent at a time with
  a short review, for everyday work. `parallel-worktrees` runs independent pieces at the same time. `methodology` is the
  full method for work under contract.
- **`bug-fix` or `flaky-test-hunt`?** `bug-fix` is for a failure that happens every time. `flaky-test-hunt` is for
  one that comes and goes; measure its rate first.
- **`architect` or `improve-codebase-architecture`?** `architect` designs something new before it is built.
  `improve-codebase-architecture` finds refactors in code that already exists.
- **`handoff` or `session-close`?** `session-close` includes the handoff. Use `handoff` alone when there is no time
  for the rest, or when the work moves to another person or tool.
- **`dependency-upgrade` or `dependency-security-audit`?** The audit finds what is risky now. The upgrade skill
  changes versions safely. An audit finding usually ends in an upgrade.
