---
name: which-skill
description: "Recommend which pau-skills skill, or sequence of skills, fits the user's situation, and what the installed hooks already do. Use when the user asks 'which skill should I use', 'what can these skills do', 'where do I start', 'is there a skill for this', 'help me pick', or seems unsure how to approach a task."
---

# Which Skill

A router over every skill in this marketplace. Read the user's situation, pick the smallest set of skills that fits,
and say in what order to run them. Do not run them yourself unless the user asks.

## How to answer

1. **Find out what the user is trying to do**, in one sentence. If it is unclear, ask one question, not five.
2. **Match it to a flow below.** Most work follows the main flow; problems come in through an on-ramp; a run that
   already went wrong goes to "Fix a run that went wrong".
3. **Recommend one starting skill** with its full invocation, then the next one or two after it. Explain in a line
   why each one fits this situation, not what it does in general.
4. **Check it is installed.** Skills are namespaced by plugin: `/verification:tdd` from the individual plugin, or
   `/pau-skills:tdd` from the bundle. If the skill's plugin is missing, give the install command
   (`claude plugin install <plugin>@pau-skills`).
5. **Mention a hook only if it matters here**, for example that `verify-before-done` will send the agent back if it
   claims to be done without running checks.

Check the project's state only when it changes the answer, and mention it only then. For example: whether a
`.claude/skills/verify-<app>/` skill exists matters when the question is about proving a change in the running app
(without one, `verify-app` comes first); whether `PROJECT.md` and a contract exist matters when the question is about
`methodology`. Do not inspect the repository for a question the tables already answer.

If an installed skill that fits the situation is missing from the tables below, read the frontmatter of its
`SKILL.md` and route by its description (a skill uploaded to claude.ai is under `~/.claude/skills/synced/*/<name>/`).
Where a table and a skill's own `SKILL.md` disagree, the skill wins.

Keep the answer short. A list of every skill is not an answer.

## Which skills ask first

Every skill can start on its own when the situation fits, and the user can also type any of them, for example
`/pau-skills:grill-me`. These ask first when the agent started them without the user asking for what they do, because
they launch subagents or headless runs, commit, push or install with no other check, or change how the session works:
`arena`, `codebase-oracle` (big questions only), `overnight-run`, `parallel-worktrees`, `agent-friendly-audit`,
`hillclimb`, `skill-eval`, `verify-app`, `dependency-upgrade`, `rule-to-hook`, `architect`, `session-close`,
`lean-subagent-dev`, `methodology`.

## Starting out

New to Claude Code, or starting in a new repository? **`project-setup`** (session-discipline) interviews the user,
writes the project CLAUDE.md, and ends with a first task. It needs no other skill.

## The main flow: from an idea to merged work

0. **`brainstorm`** (planning). With a goal but only one idea or none ("brainstorm this", "give
   me ideas", "what are my options"), widen the options first: 8 to 12 options from named lenses, the agent's picks
   to accept with a tap or an "ok", 3 or 4 finalists with a premortem each. Then run `grill-me` on the chosen
   direction.
1. **`grill-me`** (planning). Settle every open decision before anything is built, one question at a time.
   Start here whenever the user has an idea that is not fully decided.
2. **`to-prd`** (planning). Turn the decided conversation into a written spec, without interviewing again.
3. **`to-issues`** (planning). Split the spec into vertical slices that can each be built and verified alone.
4. **Build each slice with `tdd`** (verification): red, green, refactor, one behaviour at a time.
   - A new interface, module layout or data model? **`architect`** (planning) sketches two
     shapes before code, then builds against the one that survives.
   - Unsure which of several approaches is best? **`arena`** (agent-orchestration) has several
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
| "This test fails sometimes", an intermittent CI failure, a failed CI run someone wants to retry | `flaky-test-hunt` (verification): first checks for a stale base or a failure that repeats | `tdd` for the regression test; `bug-fix` if it fails every time |
| A database migration about to run | `migration-review` (verification) | fix, then review again |
| Outdated dependencies, a framework major version to adopt | `dependency-upgrade` (guards) | `dependency-security-audit` for known risk |
| "Is this ready for paying customers", "can we launch", an app about to reach beta, paying customers, enterprise buyers or regulated data | `launch-readiness` (verification) | fix the must-fix rows, then run it again |
| A CVE announcement, "are we vulnerable", "is this package safe" | `dependency-security-audit` (guards) | `dependency-upgrade` to apply fixes |
| CI is slow or expensive, "how much CI should we run" | `ci-cost-and-cadence` (verification) | |
| Review comments to work through, "which of these should I fix", a review loop that keeps going | `review-triage` (verification) | |
| A bug whose cause is not obvious, a fix that did not hold, a bug that came back, "find the root cause" (happens every time; an obvious one-line fix needs no skill) | `bug-fix` (verification) | `evaluator` to attack the fix |
| "Verify it in the app", "how can an agent test this app", no scripted way to drive the app, a skeleton or loading state that jumps | `verify-app` (verification) | `evaluator` cites its drives as evidence |
| "Show me the plan as a page", a plan with several decisions to answer at once | `html-plan` (an outside skill, if it is installed) | `grill-me` on what the response leaves open |
| A question about how the codebase works, or why it is built that way | `codebase-oracle` (agent-orchestration) | `grill-me` if it leads to a change |
| "The code is getting messy", hard-to-test modules | `improve-codebase-architecture` (planning) | `grill-me` on the candidate picked |
| A task about to start, "make sure you understand this", "restate this first", a vague or over-constrained request | `sharpen` (planning) | the skill that fits the task |
| "Make it faster", "make it smaller", improve a number (run time, bundle size, memory, a score) over many attempts with proof for each step | `hillclimb` (verification) | `bug-fix` if a step uncovers a bug |
| "Apply build the lever", "which principle applies here", a design choice such as a second flag, a new type or one edit across many files | `engineering-principles` (planning) | `architect` for new code, `improve-codebase-architecture` for existing code |
| "Run this overnight", "keep going while I sleep", work to leave running while the user is away | `overnight-run` (agent-orchestration): trust checks first, a finish condition a script checks, a decision log and a morning audit | `hillclimb` when the goal is one number; the built-in `/loop` and `/schedule` only wake a session |
| "Create an agent", "install the agent roster", "audit my agents", agents that overlap or carry leftover tools, a starter team to plan, build and review | `geppetto` (agent-orchestration): Create, Install (eng-lead, builder, reviewer, writer, sweeper), Audit, Update; asks before every write | `lean-subagent-dev` for one subagent at a time |
| "Did this skill or prompt change help?", "A/B this prompt", does a new version of a skill behave differently | `skill-eval` (verification) | `arena` to pick between attempts at one task |

## Fix a run that went wrong

| Symptom | What to do |
|---|---|
| A skill did not start on its own from the user's words | The skill listing may be over budget, so Claude Code dropped its description. Type the skill's name for now; in a new session, ask "List every skill in your skill listing that has no description" and, if any are listed, raise `SLASH_COMMAND_TOOL_CHAR_BUDGET` or turn off unused plugins (`docs/INSTALL.md` in the repository) |
| One of the skills under "Which skills ask first" asked although the user had asked for it, or started its costly step on a remark | Those skills count a request for them or for what they do, or a brief that asks for it, as a yes, and a remark that only matches the description as no. Say plainly which it was; if the skill got it wrong, that is a bug to report. Every other skill is meant to start on its own when the situation fits |
| Parallel agents overwrote each other's files | `parallel-worktrees`: one worktree and branch per agent. Telling agents "do not touch X" is not enough |
| The agent claimed success from a green build or from reading the code | Ask for the real command, the stored value read back, or a drive of the app. `evaluator` grades the change with evidence; `verify-app` gives the project a way to drive the app |
| The review and fix loop keeps going | `review-triage`: one review round, one fix round, then the rest goes to the owner or an issue |
| The same correction keeps being made, session after session | `retrospective` for this session's lessons; `rule-to-hook` once a written rule is still broken; `agent-friendly-audit` for mistakes that repeat across the whole history |
| A fix did not hold, or two fixes in a row failed | `bug-fix`: attack the premise both fixes shared before trying a third |
| A long or unattended run kept going but finished nothing | Before the next run, set a finish condition a script can check and a stop that ends it and reports to the user: a dead end, or a budget of time, attempts or money. Progress stalling is not a finish condition; without a stop the run spins. `overnight-run` to run it unattended under a contract with a morning audit; `methodology` for work under contract; `hillclimb` when the goal is a number |
| A subagent's report was taken at its word and the work was wrong | `lean-subagent-dev`: reread the diff and rerun the checks after every subagent |
| Context was lost after a compaction or a new session | `handoff` before the session ends; the `compact-snapshot` hook keeps the last messages and edited files across a compaction |

## Wording the request

When the user asks how to phrase a task for the agent, a good request names the goal, a done check that can pass or
fail, what counts as proof, the facts already known, and the real constraints. It leaves out the step-by-step how. It
names a skill only when the user wants that one (naming it is also the yes a skill under "Which skills ask first"
waits for). A theory of the cause goes in as a lead to test, not as the answer, or the agent follows it instead of
testing it. For a task the agent is about to do in this session, offer to run `sharpen` if it is installed: it
restates the task this way and confirms it before starting the work. For wording to paste elsewhere, give the
checklist above.

## Improving the agent's environment

These change how future sessions go, not the product code.

- **`retrospective`** (session-discipline): after a session with corrections, turn them into rule, memory or skill
  edits, with a gate that stops the rule files from repeating themselves.
- **`instructions-audit`** (session-discipline): review CLAUDE.md, AGENTS.md and similar files for size, duplicates,
  contradictions, stale references and vague rules.
- **`rule-to-hook`** (guards): a rule that keeps being broken becomes a tested check at the highest layer that holds it
  (types, lint or CI with a ratchet, a test, or a hook for what the agent does), instead of another sentence.
  The natural next step when `retrospective` or `instructions-audit` finds a rule that is already written down and
  still ignored.
- **`agent-friendly-audit`** (planning): mine the whole history (review comments, fix
  commits, transcripts, instruction files) for mistakes agents repeat, and get a plan that fixes each at the highest
  layer, proven on a past instance. `retrospective` covers one session; `rule-to-hook` builds one chosen rule.

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
| `suppression-reason` | Tells the agent when an edit adds a lint or type-check suppression with no reason |
| `verify-before-done` | Sends the agent back once if it changed code and ran no checks |
| `no-idle` | Tells every subagent never to end its turn waiting |

## Picking between close options

- **`brainstorm` or `grill-me`?** `brainstorm` widens: it generates and compares options when nothing is chosen yet.
  `grill-me` narrows: it settles the open decisions of a chosen plan. With only a goal, brainstorm first.
- **`html-plan`, `to-prd` or `architect`?** `html-plan` (an outside skill, if it is installed) writes the plan as one
  interactive HTML page, with each decision on the claim it changes, for the user to answer and copy back. `to-prd`
  writes a markdown spec from what is already decided. `architect` writes types and signatures in code and builds
  against them. Both offer an html-plan page when it is installed.
- **`skill-eval` or `arena`?** `arena` runs several attempts at one task and builds on the best. `skill-eval` runs the
  same task with two versions of a skill or prompt and checks whether the change alters what the agent does.
- **`hillclimb` or `bug-fix`?** `bug-fix` makes a wrong result right. `hillclimb` makes a correct result better on a
  number, one measured change at a time.
- **`grill-me` or `codebase-oracle`?** `grill-me` settles decisions that need the user's judgment.
  `codebase-oracle` answers questions the code and its history can answer. When a plan has both kinds, run the oracle first so the
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
  `improve-codebase-architecture` finds refactors in code that already exists, and carries one out when asked.
- **`handoff` or `session-close`?** `session-close` includes the handoff. Use `handoff` alone when there is no time
  for the rest, or when the work moves to another person or tool.
- **`dependency-upgrade` or `dependency-security-audit`?** The audit finds what is risky now. The upgrade skill
  changes versions safely. An audit finding usually ends in an upgrade.
