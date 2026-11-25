# Kickoff for the next session

[Back to the backlog index](../BACKLOG.md)

The twenty-second batch (Q33, pull request 88) is done. Next, in this order: **Q37** reframe and sharpen from pstack,
close to word for word (decision 33), then Q38 subagent-watchdog fixes (decision 34), Q35 `wizard`, Q34 and Q36. Read "Things that bit the twenty-second batch"
(`docs/backlog/things-that-bit/batch-22.md`) and the twenty-first's first.

Q37 copies two short typed-only skills from cursor/plugins pstack at a pinned commit. The owner already decided the
open questions (decision 33): `reframe` is new, upstream's `sharpen` replaces ours, both typed only, bodies word for
word, only the descriptions and attribution lines change. It is one slice, or two with disjoint files.

The owner starts the batch with this message:

```text
You are the orchestrator for the twenty-third batch in this repository: Q37 (reframe and sharpen from pstack, close
to word for word). Do not build it yourself; run the roster in .claude/agents/ (eng-lead, builder, reviewer) and
integrate their work. Type /lean-subagent-dev first (it is typed only since Q28).

Before anything else, read these in full:
1. CLAUDE.md and docs/ADDING-A-SKILL.md (a new skill and a replaced one: scaffold, origins, NOTICE, REFERENCE,
   which-skill, README, the typed-only rules).
2. docs/backlog/q37.md, decisions 29, 32 and 33 (docs/backlog/decisions.md), docs/backlog/how-to-run-a-batch.md
   ("With the roster", steps 8 and 10 with the patch notes), docs/RELEASES.md, and
   docs/backlog/things-that-bit/batch-21.md and batch-22.md.
3. Upstream at the pinned commit in q37.md: pstack/skills/reframe/SKILL.md and pstack/skills/sharpen/SKILL.md from
   cursor/plugins, fetched once into the scratchpad (a sparse git clone works from a session), and our current
   skills/planning/sharpen/ with every file that mentions it.

First, before any brief:
- Check CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH (it should read 3). Tell eng-lead to hand back at once with the
  builders' agent IDs if they run in the background; you start the reviewers and send the fix rounds.
- Read the base commit before you write it into any brief.
- Work the lean-subagent-dev way: a read-only plan check of every brief that builds the slice in a clone and tries
  mutations of its own, a fresh reviewer per slice, and a cold run (headless, empty HOME, --max-budget-usd) that types
  /reframe and /sharpen on a short fixture task. Commits carry the harness's two attribution trailers.

Rules that matter most:
- The skill bodies stay word for word as upstream; only the descriptions (typed-only rules: one sentence, at most 160
  characters, no "Use for" opener) and the attribution lines change. If a test objects to a body line, stop and ask me.
- Every skill works on its own; a mention of a typed-only skill holds /name in the same paragraph. Plain English, no
  em or en dashes; Node standard library only; no tracked file over its size limit.
- Every new test fails without the change: prove each with mutate.sh and report every "# tests" line.
- Run npm test before every commit, docs included. Write docs/releases/v<bundle version>.md for the batch and run its
  pre-merge check.
- Builders commit and never push. You push the working branch and open the PR. When CI is green on Linux, macOS and
  the validate job and every review is clean, merge it yourself.

When the PR is open, tell me in plain words what changed, what the reviews found, and anything I need to decide. After
the merge, check the Release run, give me the zips of every changed skill (node scripts/pack-skills.mjs --since <main
before the batch>), mark the items done in docs/backlog/ with what worked and what did not, and write the next kickoff
here.
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
2. docs/BACKLOG.md, especially decision 7 (docs/backlog/decisions-1-to-21.md), "Policy since P0.5" under "Context budget" (docs/backlog/context-budget.md), items N8, N9, P1.6, P1.7 and
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
