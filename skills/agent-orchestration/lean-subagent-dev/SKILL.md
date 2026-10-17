---
name: lean-subagent-dev
description: "A way of working for a whole session. The main session plans, talks to the owner and does every push, pull request, merge and tag; code and test work goes to one subagent at a time with a written brief; the main session checks the result itself (reads the diff, reruns the checks, runs a control) and triages the review with one review round and one fix round. Adjusts to the usage budget (tight, normal or generous): how much to delegate, which model the subagent uses, and how much review to buy. Use at the start of a session, or when the user says \"lean subagent\", \"work lean\", \"delegate this to a subagent\", \"one subagent per task\", \"brief a subagent\", \"how much should I delegate\", \"I am low on usage\", or asks how to split work between the main session and subagents."
argument-hint: "[the work for this session, or a path to a plan]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
---

# Lean subagent development

Follow this for the rest of the session. You are the orchestrator: you plan, talk to the owner, brief one subagent
at a time, check its work yourself, and decide which review findings are worth fixing.

The work: $ARGUMENTS

Bundled files, open each when you reach its step:
- `${CLAUDE_SKILL_DIR}/BRIEF-TEMPLATE.md`: the brief each subagent receives
- `${CLAUDE_SKILL_DIR}/TRIAGE.md`: how to triage review findings and when a review stops
- `${CLAUDE_SKILL_DIR}/review-scope.mjs`: prints the session's budget and the project's rules, the files a change
  touches, and the flags for a fix round (Node 20+, no dependencies, read only)

This is the light way of working: one builder, one checker, a short review. For work under a written contract, or
where a defect costs money, credentials or data, step up (see "When to step up").

## 1. At the start of the session

1. Run `node "${CLAUDE_SKILL_DIR}/review-scope.mjs" config`. It prints the budget, what goes to a subagent at that
   budget, the must-fix list, the risky paths, the checks, and the delegation log.
2. If the budget says `(from default)` and the user has not told you, ask once:
   "How much usage room do you have for this session? Tight (you often hit your limit, or you pay per token and
   cost matters), normal, or generous?" Use the answer for the rest of the session. To skip the question next time,
   they can set `LEAN_SUBAGENT_BUDGET` in the `env` block of their Claude Code settings, or `delegation.budget` in the
   project's `.claude/review-rules.json`. Do not ask which plan they are on: plans and their limits change, and what
   matters is how much room is left.
3. If no checks are configured, find the project's own test, lint and typecheck commands (its README, CI workflow,
   task runner or package manifest) and say which ones you will use.

## 2. Who does what

**You, the orchestrator:**
- talk to the owner, and ask the questions only the owner can answer
- plan the work and write the briefs
- make trivial edits yourself: edits that change no behaviour and stay below the file threshold (a typo, a version
  string, a config value, a one-line doc fix)
- do every write outside the local repository: push, pull request, merge, tag, release, issue, comment. These are
  never delegated.
- verify every subagent's work and triage every review

**One subagent at a time:**
- the work the "Delegate" row of the budget table names for the session's budget; `config` prints the same rule
- in sequence, never two in one checkout. For independent pieces in parallel, use `parallel-worktrees` if it is
  installed; without it, run the pieces one after another.

### What the budget changes

A subagent starts with an empty context and reads what it needs again, so delegating usually costs more usage in
total, not less. What it saves is your own context, which keeps a long session sharp. So a tight budget delegates
less and spends less on review, and a generous budget delegates more and buys more review.

| | Tight | Normal | Generous |
|---|---|---|---|
| Delegate | Changes of 5 or more files; make smaller changes yourself | Any change in behaviour or tests, and any change of 3 or more files | Any change in behaviour or tests, and any change of 2 or more files |
| Subagent model | A smaller model for mechanical work (renames, version bumps, docs, boilerplate); the same model for anything in a risky path | The same model | The same model |
| Plan check before building | You, against the code, in a few minutes | A read-only subagent, for new behaviour | A read-only subagent, always |
| Review round | Your verification is the review | Your verification, plus your own read of every risky file | Plus a separate reviewer subagent on risky files |
| Fix round | Inline when small | Back to the same subagent | Back to the same subagent |

The model is set with the `model` field of the Agent tool; leave it out to use the session's model. Check which
model names your Claude Code version accepts. Never use a smaller model for work in a risky path, whatever the budget.

## 3. Before building new behaviour

Check the plan against the real environment before anything is built, at the level the budget table says. The checker
reads the plan and the code, the CI configuration and whatever the work will run on, and lists every assumption in the
plan that is false. A finding here costs a sentence to fix; the same finding after the build costs a fix round. Fix
anything real it finds before you brief the builder.

## 4. Brief the subagent

Copy `${CLAUDE_SKILL_DIR}/BRIEF-TEMPLATE.md` and fill every bracket. The briefs that work name:
- the goal and the exact files, and what is out of bounds
- the project rules that apply, quoted
- what done means, as commands that must pass
- when to stop and report instead of carrying on
- "commit, never push"
- the fixed report format, including "anything I was unsure about". That line is where the real findings come from.

Write down the commit the subagent starts from.

## 5. Check the work yourself

Do all four, every time. A subagent's report is a claim, not evidence.

1. **Read the report.** Every item under "unsure about" becomes a finding for triage.
2. **Read the diff.** `git diff <start commit>` and
   `node "${CLAUDE_SKILL_DIR}/review-scope.mjs" change --base <start commit>`. A file outside the brief's list is a
   finding.
3. **Run the checks yourself**, after the subagent finished, in the checkout you will push from.
4. **Run a control where it matters**: a run that would fail if the change were wrong, and does. For example, the
   right input passes and the wrong one is rejected; the old version fails the new test. A control is required for
   new behaviour on the main path and for any change in a risky path. If the `mutation-test` skill is installed, it
   does this for a single test; without it, break the code by hand, watch the test fail, and restore it.

## 6. Review and fix

Run the review round the budget table says, then triage every finding, your own included, with
`${CLAUDE_SKILL_DIR}/TRIAGE.md`. If the `review-triage` skill is also installed, it is the same method; there is no
need to load it as well.

- Must fix and fix if cheap go back to the subagent in one fix round, test first, or are fixed inline when the budget
  says so. If your Claude Code version can continue a finished subagent (for example by sending it a message), do
  that, so it keeps its context; otherwise brief a new one with the findings, the failing behaviour and the diff.
- Then run `node "${CLAUDE_SKILL_DIR}/review-scope.mjs" fix --since <reviewed commit> --base <start commit>`, answer
  every flag, and give the fix its second look: the fix only, not the whole change.
- One review round and one fix round. What the second look finds goes to the owner (a must-fix) or to an issue
  (anything else).

Then do the GitHub writes yourself, the way the project lands work.

## 7. Keep a log

If the config output shows a delegation log, append one line per task to it, with today's date from the machine:

```
- YYYY-MM-DD | <task> | files <n> | <inline | subagent, model> | check found: <nothing | finding> | review rounds 1, fix rounds <0 or 1> | brief missed: <what the subagent asked, got wrong, or was unsure about, or "nothing">
```

After a week or so the log answers whether this way of working pays off: how much went to a subagent, whether the
threshold was right, whether your checks found anything, whether the round limit held, and what the briefs kept
missing.

## When to step up

Use a heavier method when:
- the work has a written contract or acceptance criteria that must all hold, or a defect would cost money,
  credentials or data. If the `evaluator` skill is installed, have it grade the change; if the `methodology` skill
  is installed, it has the full method. Without them, start a fresh subagent that has not seen the build, give it
  the criteria and the code, and have it show evidence for each one.
- the second look found a must-fix. Stop and ask the owner.
- a subagent failed the same task twice. Do it yourself, or ask the owner whether the task is right.

## Configuration

Optional `.claude/review-rules.json` in the repository. Every key is optional:

```json
{
  "mustFix": ["a command runs against the wrong account", "a test touches a real external service"],
  "riskyPaths": ["src/core/decide/**", "migrations/"],
  "checks": ["make test", "make lint"],
  "delegation": { "budget": "normal", "minFiles": 3, "log": "docs/delegation-log.md" }
}
```

`mustFix` is added to the defaults (run `config` to see them). `riskyPaths` names the code where a small fix can break
more than it repairs. `delegation.budget` is `tight`, `normal` or `generous`; the `LEAN_SUBAGENT_BUDGET` environment
variable wins over it, because the budget belongs to the person more than to the project. `minFiles` overrides the
budget's threshold. Without `log` nothing is logged. `testPaths` and `docPaths` replace the default globs for tests
and documentation. An unknown key is an error, so a typo cannot switch a rule off without anyone noticing.

## Report to the owner after each task

```
Task: <name>   Route: <inline | subagent, model>   Budget: <tight | normal | generous>
Changed: <files, one line>   Commits: <range>
Checks I ran: <command: PASS | FAIL>   Control: <what, result | not needed because ...>
Review: <findings by bucket>   Fix round: <none | commits>   Second look: <clean | what, and where it went>
Needs you: <questions or decisions, or "nothing">
```

## Do not

- Do not let a subagent push, open or merge a pull request, tag or release.
- Do not run two subagents in the same checkout.
- Do not accept a subagent's report without rereading the diff and rerunning the checks.
- Do not start a third round. Hand it to the owner or to an issue.
- Do not delegate a task you cannot write a "done when" for. Plan it first.
