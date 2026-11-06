# Kickoff for the next session

[Back to the backlog index](../BACKLOG.md)

The fifteenth batch is done: Q18 (pull request 65), Q19 (pull request 67) and Q20 (pull request 69). After Q20 the
owner updates the hooks plugin on each computer (`claude plugin marketplace update pau-skills`, then
`claude plugin update pau-skills-hooks@pau-skills`). The next item is Q21, a subagent watchdog (decision 22,
`docs/backlog/q21.md`). Read "Things that bit the fifteenth batch" (`docs/backlog/things-that-bit/batch-15.md`) first.
The owner starts it with this message:

```text
You are the orchestrator for Q21 in this repository: a subagent watchdog. Do not build it yourself; run the roster in
.claude/agents/ (eng-lead, builder, reviewer) and integrate their work. My choices are decision 22 in
docs/backlog/decisions.md; build the direction it chooses (the waste detector and the orchestrator status, sharing one
state file).

Before anything else, read these in full:
1. CLAUDE.md and docs/ADDING-A-SKILL.md (step 5 covers hooks).
2. docs/BACKLOG.md (the note at the top, "How to work an item", the Contents and "Order"), docs/backlog/q21.md,
   docs/backlog/q20.md, decisions 7 to 22, docs/backlog/how-to-run-a-batch.md (all 10 steps and "With the roster"),
   and every file in docs/backlog/things-that-bit/, batch-15.md first.
3. skills/agent-orchestration/lean-subagent-dev/SKILL.md, its BRIEF-TEMPLATE.md and TRIAGE.md, the five agent files
   in .claude/agents/, hooks/README.md, hooks/lib/config.mjs, hooks/agent-orchestration/no-idle.mjs and
   hooks/verification/verify-before-done.mjs. Work that way for the whole session. The usage budget is generous: same
   model for every agent, a read-only plan check of every brief that builds the slice in a clone and tries mutations
   of its own (and times long inputs to any new pattern), and a fresh reviewer per slice.

First, before any brief:
- Check CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (it should read 3). Tell eng-lead to hand back at once with the
  builders' agent IDs if they run in the background; you start the reviewers and send the fix rounds.
- Settle the two facts q21.md leaves open with one small headless prototype (a throwaway hook that logs its input,
  one subagent with a few tool calls, empty HOME): what "ask" from a PreToolUse hook does in a headless run, and
  whether a subagent's hooks see the parent's session_id. Give me the estimate first: it is a paid run and needs my
  yes. Then propose the default thresholds and what counts as an edit, and ask me.
- Commits carry the harness's two attribution trailers; say so once in the standing orders.

Rules that matter most:
- Hard limits from decision 22: never cut off a healthy long run; stopping needs a yes (mine or the orchestrator's,
  through TaskStop); a hook in pau-skills-hooks that works with no skill installed; it works in cloud sessions.
- A hook exits 0 on input it does not understand and checks hookEnabled(); Node standard library only; no em or en
  dashes; plain English. No tracked file may pass 20,000 bytes.
- Every new test must fail when the behaviour it covers breaks: prove each with mutate.sh after committing, and have
  every run report its "# tests" line.
- Builders commit and never push. You push the working branch and open the PR. When CI is green on Linux, macOS and
  the validate job and every review is clean, merge it yourself and carry on. Bump pau-skills-hooks and give me the
  update commands.
- Give long briefs to agents as files they read, with a "Corrections after the plan check" section. Use absolute
  paths and git -C from the orchestrator; never cd into an agent's worktree. Commit as the session's default author.

When the PR is open, tell me in plain words what changed, what the reviews found, and anything I need to decide; if
html-plan is installed, give me the decisions as an html-plan page published as a private artifact. After the merge,
mark Q21 done in docs/backlog/ with what worked and what did not with the roster, and write the next kickoff here.
```

## The fifth batch's kickoff, as a template

A batch kickoff names the items, the decisions to settle first, and the rules that matter most. For a later batch,
change the item list and the decision paragraph; the rest stays.

```text
You are the orchestrator for the fifth batch of work in this repository: N8 overnight-run, N9
engineering-principles, and the small items P1.6, P1.7 and P1.8. Do not build the skills yourself; run builder
subagents and integrate their work.

Before anything else, read these in full:
1. CLAUDE.md and docs/ADDING-A-SKILL.md (the repository rules, including step 2 and step 8's bump-listing command).
2. docs/BACKLOG.md, especially decision 7 (docs/backlog/decisions.md), "Policy since P0.5" under "Context budget" (docs/backlog/context-budget.md), items N8, N9, P1.6, P1.7 and
   P1.8 (all of each; N8 and N9 in docs/backlog/n-new-skills.md, the P1 items in docs/backlog/p1-small-tooling.md), "How to work an item", "How to run a batch" in docs/backlog/how-to-run-a-batch.md (all 10 steps and every list of things that bit
   earlier batches in docs/backlog/things-that-bit/, the fourth batch's included) and "Order".
3. skills/agent-orchestration/lean-subagent-dev/SKILL.md and its BRIEF-TEMPLATE.md and TRIAGE.md. Work that way for
   the whole session. The usage budget is generous: same model for every subagent, a read-only plan check of every
   brief before any builder starts, a fresh reviewer per item, and a cold run (headless, empty HOME) for any item that
   changes how a skill behaves when it runs.

First, before any brief: the two new skills do not fit the description budget. All descriptions total 11,594 of the
12,000 characters `tests/context-budget.test.mjs` allows, and two new ones at 250 to 350 characters each would pass
it. Ask me to choose: raise MAX_TOTAL (to 13,000, since SLASH_COMMAND_TOOL_CHAR_BUDGET is 80000 on every computer
and in the cloud environment), or trim existing descriptions to make room, and say which you recommend.

The batch, one builder each, each in its own git worktree, with disjoint files:
- N8 overnight-run (new skill, agent-orchestration, with log.mjs and its tests). It runs unattended and launches
  headless runs, so settle in the plan check that it joins CONFIRM_LIST, and keep tests/confirm-step.test.mjs, the
  README and which-skill in step;
- N9 engineering-principles (new skill, planning: an index in SKILL.md and PRINCIPLES.md; read only, so it stays off
  the confirm list unless the plan check finds otherwise);
- P1.6, P1.7 and P1.8 as a small third builder: audit.mjs sees short CLAUDE.md bullets and synced skills (both copies,
  tests first), mutate.sh and Python bytecode, and the evaluator's evidence line.
You own README (skill badge 34 to 36), CHANGELOG, marketplace.json versions, NOTICE, ORIGINS, which-skill,
tests/standalone.test.mjs, the confirm-list test and docs/BACKLOG.md and docs/backlog/.

Rules that matter most:
- Every skill works on its own; no em or en dashes; plain English; Node standard library only.
- Descriptions stay at most 400 characters each and within the total you and I settle, with no angle-bracket tag;
  quote only phrases that ask for the work.
- Builders commit and never push. You push the working branch and open the PR. Never merge it yourself unless I say
  so.
- Watch CI on macOS as well as Linux, and the validate job.

When the PR is open, tell me in plain words what changed, what the reviews and cold runs found, and anything I need
to decide. After I merge it, run `node scripts/pack-skills.mjs --since <main before the batch>` on main and send me
the changed skills' zips together in one bundle zip (a folder of per-skill zips plus HOW-TO-UPLOAD.txt), say which
replace a skill I have and which are new, mark the items done in docs/BACKLOG.md and docs/backlog/, and update the skill count on my
profile README in paureis/paureis. If any hook changed, bump pau-skills-hooks and give me the update commands.
```
