---
name: methodology
description: "Install a discipline for building software with AI agents in which no agent certifies its own work: contracts with verify clauses, a separate evaluator, two state files. Use when the user says 'adopt the methodology', 'set up a contract', or wants PROJECT.md and log.md, or when they ask how agents should verify their work."
---

# Methodology

If you started this skill on your own, without the user typing its name or asking for it, first say in one or two
lines what it will do and what it will cost, and wait for a yes. If the user asked for it, go ahead.

The method is in `${CLAUDE_SKILL_DIR}/METHODOLOGY.md`. Read it before doing anything else; every
term below is defined there.

## Pick the door

- **New project, no code yet**: follow `${CLAUDE_SKILL_DIR}/PROMPT-new-project.md`. About an hour.
- **Existing project that works, discipline for new work only**: follow
  `${CLAUDE_SKILL_DIR}/PROMPT-adopt-forward-only.md`. One session, no audit of what exists. This
  is the right door for most existing projects.
- **After every increment, either way**: have an evaluator grade it in a fresh context. If the `evaluator` skill is
  installed, run it. If not, start a new subagent or session as the evaluator in mechanisms 3 and 5 of
  METHODOLOGY.md: give it the contract and the code, never the conversation that built it, and have it grade each
  assertion with evidence it reproduced and mutation-verify every test it relies on. If the user adopts exactly one
  thing, it is this.

Ask which door applies if it is not obvious from the repository.

## Templates

In `${CLAUDE_SKILL_DIR}/templates/`:

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
2. **Mutation-verify every guard.** Introduce the defect, watch the test go red, revert. If the `mutation-test` skill
   is installed, it does this with its assertions checked by a script.
3. **Done means an adversary found nothing new, twice.** Not "the task list is empty."

Do not copy phase names, rubrics or tooling from the method's source project; those are its clothes, not its skeleton.
Multi-agent orchestration is an accelerant, not the method: all of this works with one model and two chat windows.
