# Kickoff for the next session

[Back to the backlog index](../BACKLOG.md)

Batch 7 is done: Q1 merged as pull request 31, Q4 as pull request 33 and Q10 as pull request 38. The next session runs
batch 8, Q3 designer agent and Q8 production rules from day one, the last items of section Q. Read "Things that bit
the seventh batch" (`docs/backlog/things-that-bit/batch-7.md`) first, the Q10 part most of all: with nesting on,
`eng-lead` started the builders but they ran in the background, so the main session started the reviewers. The owner
starts it with this message:

```text
You are the orchestrator for the eighth batch in this repository: Q3 designer agent and Q8 production rules from day
one. Do not build it yourself; run the roster in .claude/agents/ (eng-lead, builder, reviewer) and integrate their
work.

Before anything else, read these in full:
1. CLAUDE.md and docs/ADDING-A-SKILL.md (the repository rules, including step 2 and step 8's bump-listing command).
2. docs/BACKLOG.md (the index: the note at the top that every item is a starting point to review and improve, "How
   to work an item", the Contents and "Order"), then docs/backlog/q3.md and docs/backlog/q8.md (all of each),
   docs/backlog/q2.md and docs/backlog/q6.md (the items they build on), decisions 7 to 12 in
   docs/backlog/decisions.md, "Policy since P0.5" in docs/backlog/context-budget.md,
   docs/backlog/how-to-run-a-batch.md (all 10 steps and "With the roster"), and every file in
   docs/backlog/things-that-bit/, batch-7.md first.
3. skills/agent-orchestration/lean-subagent-dev/SKILL.md, its BRIEF-TEMPLATE.md and TRIAGE.md, the five agent files
   in .claude/agents/, and skills/agent-orchestration/geppetto/SKILL.md with its roster/ folder. Work that way for the
   whole session. The usage budget is generous: same model for every agent, a read-only plan check of every brief
   that builds the slice in a clone, a fresh reviewer per slice, and a cold run (headless, empty HOME) for each
   changed skill behaviour: project-setup on a fixture project, and the designer agent on a fixture design system.

First, before any brief:
- Check CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (it should read 3). Expect eng-lead's builders to run in the background:
  their reports come to you, so you start the reviewers and send the fix rounds, with the reviewer contract as a file.
- Check whether the Figma connector works in this session (ToolSearch for figma, then one read call). It failed with a
  proxy 403 in the sessions of 2026-10-19 and 2026-10-22. If it fails again, build Q3 on a code design system (a
  tokens file and components), as q3.md allows, and tell me.
- Review Q3 and Q8 against the code and tell me anything you would change; record it in each item. Both touch
  geppetto: Q3 adds a designer agent that geppetto creates on request, and Q8 puts production rules into the covenant
  for coding agents, which changes the roster (raise the roster number on every covenant marker, then update the
  installed copies in .claude/agents/). Either make the geppetto changes one slice, or order the slices and say which
  merges first. Q8 also touches project-setup and rule-to-hook, takes its rules from Q6's area files in
  launch-readiness, and copies them into each skill that needs them; the COPIES entries in tests/standalone.test.mjs
  are yours to add.
- The file-size rule is on: no tracked file may pass 20,000 bytes. A slice that would push a file over splits it
  first (tests/<name>-<part>.test.mjs plus a tests/<name>.helpers.mjs).

Rules that matter most:
- Every skill works on its own; no em or en dashes; plain English; Node standard library only.
- Descriptions stay at most 400 characters each and 14,000 in total, with no angle-bracket tag. project-setup's first
  visible text stays its introduction.
- Every new test must fail when the behaviour it covers breaks: prove each with mutate.sh after committing, and have
  every run report its "# tests" line (a glob that matches no file passes the control and reads as SURVIVED).
- Builders commit and never push. You push the working branch and open the PR. When CI is green on Linux, macOS and
  the validate job and every review is clean, merge it yourself and carry on.
- Before pushing a change that compares paths, run its tests with a short TMPDIR link (made with mktemp -d while
  TMPDIR is unset).
- Give long briefs to agents as files they read, with a common part and a "Corrections after the plan check"
  section. Describe an escape such as a byte order mark in words; one typed into a tool call arrives as the raw
  character.
- Use absolute paths and git -C from the orchestrator; never cd into an agent's worktree.
- Commit as the session's default author. If a hook file changes, bump pau-skills-hooks too and give me the update
  commands.

When the PR is open, tell me in plain words what changed, what the reviews and cold runs found, and anything I need
to decide; if html-plan is installed, give me the decisions as an html-plan page published as a private artifact.
After the merge, run `node scripts/pack-skills.mjs --since <main before the batch>` on main and send me the changed
skills' zips in one bundle zip with HOW-TO-UPLOAD.txt, mark Q3, Q8 and batch 8 done in docs/backlog/ with what worked
and what did not with the roster, write the kickoff for whatever is left in the backlog (or say it is empty) into
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
