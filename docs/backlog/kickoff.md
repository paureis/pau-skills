# Kickoff for the next session

[Back to the backlog index](../BACKLOG.md)

Batch 8 is done: Q3 and Q8 merged as pull request 41. Every item from the pstack review and section Q is done. What
is left is Q11, what batch 8 left. The owner answered the batch 8 decisions page with every recommendation
(decision 13): project-setup sends its introduction alone and ends its turn, rule 2 gains a lookup clause, the check
ids stay in the table, and the headless gaps become part of Q11. Read "Things that bit the eighth batch"
(`docs/backlog/things-that-bit/batch-8.md`) first. The owner starts it with this message:

```text
You are the orchestrator for Q11 in this repository: what batch 8 left. Do not build it yourself; run the roster in
.claude/agents/ (eng-lead, builder, reviewer) and integrate their work. My answers from the batch 8 decisions page are
decision 13 in docs/backlog/decisions.md; build the parts it chooses.

Before anything else, read these in full:
1. CLAUDE.md and docs/ADDING-A-SKILL.md (the repository rules, including step 2 and step 8's bump-listing command).
2. docs/BACKLOG.md (the note at the top, "How to work an item", the Contents and "Order"), docs/backlog/q11.md,
   docs/backlog/q3.md and docs/backlog/q8.md (what batch 8 built and changed), decisions 7 to 13 in
   docs/backlog/decisions.md, "Policy since P0.5" in docs/backlog/context-budget.md,
   docs/backlog/how-to-run-a-batch.md (all 10 steps and "With the roster"), and every file in
   docs/backlog/things-that-bit/, batch-8.md first.
3. skills/agent-orchestration/lean-subagent-dev/SKILL.md, its BRIEF-TEMPLATE.md and TRIAGE.md, the five agent files
   in .claude/agents/ (roster 3), and skills/agent-orchestration/geppetto/SKILL.md with its roster/ and templates/
   folders. Work that way for the whole session. The usage budget is generous: same model for every agent, a
   read-only plan check of every brief that builds the slice in a clone, a fresh reviewer per slice, and a cold run
   (headless, empty HOME, --setting-sources user,project) for each changed skill behaviour.

First, before any brief:
- Check CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (it should read 3). Tell eng-lead to hand back at once with the
  builders' agent IDs if they run in the background; you start the reviewers and send the fix rounds, with the
  reviewer contract as a file.
- Review Q11 against the code and tell me anything you would change; record it in the item. If rule 2 changes, the
  block in builder and reviewer changes: raise the roster number on every covenant marker, then update the installed
  copies in .claude/agents/ in the merge commit.
- Decide in the standing orders whether commits carry the harness's attribution trailers, and say it once.

Rules that matter most:
- Every skill works on its own; no em or en dashes; plain English; Node standard library only. project-setup's first
  visible text stays its introduction, proven by a one-turn headless run that counts the tool calls before the first
  text, not by reading the prose.
- Descriptions stay at most 400 characters each and 14,000 in total, with no angle-bracket tag.
- No tracked file may pass 20,000 bytes. The four PRODUCTION-RULES.md copies stay identical (COPIES).
- Every new test must fail when the behaviour it covers breaks: prove each with mutate.sh after committing, and have
  every run report its "# tests" line.
- Builders commit and never push. You push the working branch and open the PR. When CI is green on Linux, macOS and
  the validate job and every review is clean, merge it yourself and carry on.
- Give long briefs to agents as files they read, with a common part and a "Corrections after the plan check"
  section. Use absolute paths and git -C from the orchestrator; never cd into an agent's worktree.
- Commit as the session's default author. If a hook file changes, bump pau-skills-hooks too and give me the update
  commands.

When the PR is open, tell me in plain words what changed, what the reviews and cold runs found, and anything I need
to decide; if html-plan is installed, give me the decisions as an html-plan page published as a private artifact.
After the merge, run `node scripts/pack-skills.mjs --since <main before the batch>` on main and send me the changed
skills' zips in one bundle zip with HOW-TO-UPLOAD.txt, mark Q11 done in docs/backlog/ with what worked and what did
not with the roster, write the kickoff for whatever is left in the backlog (or say it is empty) into
docs/backlog/kickoff.md, and update my profile README in paureis/paureis if a count changed.
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
