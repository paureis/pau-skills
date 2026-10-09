---
name: retrospective
description: Analyze the current session to extract reusable learnings and apply them to the right durable store (CLAUDE.md, the memory system, or a specific skill file), gated so the rule stores do not grow by restating themselves. Use when the user asks for a retrospective, "what did we learn", "what should we improve", or "how should skills be updated". Suggest it proactively after a multi-step task with repeated corrections, work redone 3+ times, or improvised steps. Improves how you work, which is distinct from documenting what was built.
---

# Retrospective

Analyze the current conversation, extract learnings that should improve future work, and, on the user's approval, apply each to the right durable place. In Claude Code you don't just *suggest* where a learning goes; you can make the edit.

This improves *process and skills*, which is different from documenting a deliverable (that's a summary). Where narrower tools fit, delegate to them rather than duplicating: the `claude-md-management:revise-claude-md` skill for CLAUDE.md edits if it is installed, and the built-in memory system for feedback and preferences.

The audit script used below is `${CLAUDE_SKILL_DIR}/audit.mjs`. Run it with `node` from the project root.

## When to Use

- After a multi-step task where corrections were needed, or the user says "retrospective", "what did we learn", "what should we improve".
- **Proactively suggest** (don't auto-run) when, in the session: the user made more than 2 corrections, an artifact was regenerated 3+ times, or steps were improvised that aren't standard. The user decides whether to run it.

## Step 1: Extract Signals

Scan the conversation for:

- **Corrections (highest priority)**: the user rejected output ("this is wrong", "remove this"), redirected the approach ("no, do it this way"), or supplied context you lacked.
- **Redone work**: something generated, rejected, redone differently; 3+ iterations on one artifact.
- **Missing steps**: things improvised that should have been anticipated.
- **What worked well**: patterns that succeeded first try and should become the default.

## Step 1.5: The Redundancy Gate ("the shorter, the better")

Every learning that survives Step 1 must pass this before it can be proposed, and the table in Step 3 must
show the result. The failure this prevents: a rule store that keeps growing by restating itself until nobody
reads it. Growth is the cost; a learning has to buy its place.

1. **Search before you write.** Put the proposed learning in a scratch file and run
   `node "${CLAUDE_SKILL_DIR}/audit.mjs" --check <file>` from the project root (it scores the
   text against every unit of both CLAUDE.md files, every memory and every skill). Classify against the closest unit:
   - **DUPLICATE** (already stated): drop it. If it happened anyway, the existing rule failed as a rule, so the
     retrospective item becomes "make that rule enforceable" (a gate, a script, a test), never a restatement.
   - **EXTENDS** (an existing unit covers the class; this is a new instance or mechanism): edit that unit in
     place, net growth at most 3 lines, deleting any sentence it supersedes.
   - **NEW** (no unit in the audit's "related" band): allowed only if it is a rule that will recur, names the
     failure it prevents, and fits in 8 lines or fewer. One-off fixes go to the session log, not a rule store.
2. **Pay for growth.** A session's net change to the rule stores should be zero or negative. Pair each NEW
   unit with a consolidation taken from the audit's "most overlapping pairs" list; if none is worth doing,
   say so in the table and let the user decide.
3. **Measure and report.** Run `node "${CLAUDE_SKILL_DIR}/audit.mjs"` before and after
   applying and put each store's before/after bytes in the final message. If MEMORY.md exceeds about 60 lines or a
   single memory exceeds about 4 KB, propose the trim in the same retrospective.
4. **Prune on a cadence.** When the audit lists more than ten pairs above its floor, the first row of the
   table is a consolidation pass, not a new learning.
5. **Stale references.** Run `node "${CLAUDE_SKILL_DIR}/audit.mjs" --stale` from the project
   root: it lists every backticked path or `npm run` script cited in the project CLAUDE.md, memory and project
   skills that no longer exists (exit 2). Each hit is fixed or deleted in the same retrospective; a rule that points
   at something that is gone is stale by definition.

## Step 2: Categorize Each Learning

For each: what the learning is (concrete and specific), which skill/workflow/preference it relates to, and whether it's a new rule, a fix to an existing habit, or something to stop doing.

## Step 3: Present Findings

```
| # | Learning | Category | Gate result (closest existing unit) | Where to capture | Suggested change |
|---|----------|----------|--------------------------------------|------------------|------------------|
| 1 | Verify schema before writing DB code | Dev workflow | EXTENDS: skill implement-feature, Step 2 | skill: implement-feature | +2 lines in Step 2 |
| 2 | Always confirm before pushing | Preference | NEW (no match) | memory (feedback) | New 6-line memory; paired consolidation: merge memories X and Y |
| 3 | Re-read the seam after a scripted edit | Process | DUPLICATE: global CLAUDE.md "verify the artifact" | none | The rule failed as a rule; propose a gate instead |
```

Explain each with enough detail that the user can decide whether to adopt it. Get approval before editing anything.

## Step 4: Apply (on approval) to the Right Store

Route each approved learning and make the edit:

- **Behavioral rule / process change / anti-pattern** -> `CLAUDE.md` (project `./CLAUDE.md` for project rules, global `~/.claude/CLAUDE.md` for cross-project).
- **Feedback, preference, or project fact** -> the **memory system**: write a memory file in the project's memory directory using the documented frontmatter, and add the one-line pointer to `MEMORY.md`. First check for an existing memory that already covers it and update that instead of duplicating.
- **Skill improvement** -> edit the specific `SKILL.md` (project `.claude/skills/<name>/` or global `~/.claude/skills/<name>/`). Describe the exact edit, then make it on approval.
- **Project-specific context that isn't a rule** -> a project reference doc or a `reference`-type memory.

Don't capture the same learning in two places. Pick the store that will actually be consulted at the right time (a rule the model must follow -> CLAUDE.md or memory; a behavior inside one workflow -> that skill file).

## What TO Encode

Process changes ("do X before Y"), anti-patterns ("X causes Y, so do Z"), format rules, missing steps that should be standard, and proven patterns that consistently worked. Write each rule as the current behavior at normal volume with its reason in one clause; the incident's date, retelling and instance list go to the session log, not the rule store.

## What NOT to Encode

One-off fixes that won't recur, content-specific decisions, temporary state (dates/deadlines), and things the user already knows and just forgot to mention.

## Fixes in the rule itself

Fix the general rule a failure violates rather than adding an exception for it:
- "Add a special case for X" -> find the general rule X violates.
- "Remember to check for X" -> build X into the standard process.
- "Add a reminder to do Y" -> make Y a default step, not an afterthought.
- A rule broken for the third time after being written down -> stop rewriting it and mechanize it (a hook, a script, a test).
