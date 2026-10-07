---
name: methodology
description: "Install or apply an operating discipline for building software with AI agents, built on one idea (an agent cannot certify its own work): contracts with verify clauses, an evidence standard, generator and evaluator in separate contexts, convergence by adversary, mutation verification, falsified premises, and two-file state. Use when the user wants to set up this method in a new or existing project, asks \"how should agents verify their work\", \"set up a contract\", \"adopt the methodology\", or wants the PROJECT.md / log.md state protocol."
---

# Methodology

The method is in `${CLAUDE_PLUGIN_ROOT}/skills/methodology/METHODOLOGY.md`. Read it before doing anything else; every
term below is defined there.

## Pick the door

- **New project, no code yet**: follow `${CLAUDE_PLUGIN_ROOT}/skills/methodology/PROMPT-new-project.md`. About an hour.
- **Existing project that works, discipline for new work only**: follow
  `${CLAUDE_PLUGIN_ROOT}/skills/methodology/PROMPT-adopt-forward-only.md`. One session, no audit of what exists. This
  is the right door for most existing projects.
- **After every increment, either way**: run the `evaluator` skill from the `verification` plugin in a fresh context.
  If the user adopts exactly one thing, it is this.

Ask which door applies if it is not obvious from the repository.

## Templates

In `${CLAUDE_PLUGIN_ROOT}/skills/methodology/templates/`:

| File | Use |
|---|---|
| `CLAUDE-rules.md` | Operating-rules block to merge into the project's `CLAUDE.md` |
| `CLAUDE-rules-forward-only.md` | The same for the forward-only door: process tiers, the trust line, the contagion rule |
| `PROJECT.md` | Mutable state file: phase, open gate, next action, done / in-flight / blocked |
| `log.md` | Append-only history, `## [YYYY-MM-DD] phase \| event` |
| `contract.template.json` | Annotated contract schema: assertions with `verify` clauses, `pinnedValues`, `nonGoals`, `gradingRule` |

Copy them into the project, fill every bracket, and do not keep the brackets' wording.

## The three rules that carry most of the weight

1. **The builder never grades itself.** Different context, hostile prior, no access to how or why it was built.
2. **Mutation-verify every guard.** Introduce the defect, watch the test go red, revert. The `verification` plugin's
   `mutation-test` skill does this with its assertions checked by a script.
3. **Done means an adversary found nothing new, twice.** Not "the task list is empty."

Do not copy phase names, rubrics or tooling from the method's source project; those are its clothes, not its skeleton.
Multi-agent orchestration is an accelerant, not the method: all of this works with one model and two chat windows.
