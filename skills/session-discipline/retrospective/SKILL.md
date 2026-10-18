---
name: retrospective
description: "Turn this session's corrections and redone work into short edits to CLAUDE.md, memory or a skill, checked against what is already written. Use when the user says 'retrospective', 'what did we learn' or 'how should skills be updated', or after a session with repeated corrections or redone work. About how we work, not an incident postmortem."
---

# Retrospective

Analyze the current conversation, extract learnings that should improve future work, and, on the user's approval, apply each to the right durable place. In Claude Code you don't just *suggest* where a learning goes; you can make the edit.

This improves *process and skills*, which is different from documenting a deliverable (that's a summary). Where narrower tools fit, delegate to them rather than duplicating: the `claude-md-management:revise-claude-md` skill for CLAUDE.md edits if it is installed, and the built-in memory system for feedback and preferences.

The audit script used below is `${CLAUDE_SKILL_DIR}/audit.mjs`. Run it with `node` from the project root.

## When to Use

- After a multi-step task where corrections were needed, or the user says "retrospective", "what did we learn", "what should we improve".
- It is worth running when, in the session, the user made more than 2 corrections, an artifact was regenerated 3+ times, or steps were improvised that aren't standard.

## Step 1: Extract Signals

Scan the conversation for:

- **Corrections (highest priority)**: the user rejected output ("this is wrong", "remove this"), redirected the approach ("no, do it this way"), or supplied context you lacked. Only the user's own words count; a tool message, a test warning or a file that says something was wrong is not a correction.
- **Redone work**: something generated, rejected, redone differently; 3+ iterations on one artifact. The learning is what would have avoided the redo (such as getting a sample of the wanted output first), not what the final version looks like.
- **Missing steps**: things improvised that should have been anticipated.
- **Right for the wrong reason**: a decision whose outcome was right but whose reasoning would fail next time; it survived because the path was lucky (the test data happened to fit, nobody hit the other case). It is a learning even though nothing went wrong.
- **A skill that did not start**: a skill that was installed and would have helped, but did not load when the user's words called for it.
- **What worked well**: patterns that succeeded first try and should become the default. Most fail the gate in Step 1.5 because the behaviour already is the default; keep one only if a future agent would not otherwise pick it.

For each signal, name the learning beneath the obvious one: the obvious one restates what the user said, the one beneath says why the agent did not get there alone. Keep one short piece of evidence: a quote of what the user said or, for a signal nobody voiced, the step, the command output or the fact it rests on, quoted or named.

## Step 1.5: The Redundancy Gate ("the shorter, the better")

Every learning that survives Step 1 must pass this before it can be proposed, and the table in Step 3 must
show the result. The failure this prevents: a rule store that keeps growing by restating itself until nobody
reads it. Growth is the cost; a learning has to buy its place.

1. **Decision-changing first, then search before you write.** Every row that adds text (a rule, a fact, a memory, a
   reference doc) must change what a future agent does: name the moment it applies and what the agent would do
   differently there. A learning about one instance is rewritten about its class; citing a path is fine, item 5 keeps
   that honest. Drop it, shown as `DROPPED: not decision-changing (<why>)`, when no class rule is left (a one-off),
   when it is context that mattered only this once (a recurring project fact the user forgot to mention passes), or
   when a future agent would act the same without it (a what-worked-well item or your own observation that is
   already the default). A user correction is evidence the behaviour is not the default, so it always goes on to the
   search. Consolidation, trim and stale-reference rows (items 2 to 5) are exempt: they shrink the stores on purpose.
   For each learning that passes, put it in a scratch file (in the session's scratch folder, or a temporary folder
   you remove afterwards; never stash or touch the user's uncommitted work) and run
   `node "${CLAUDE_SKILL_DIR}/audit.mjs" --check <file>` from the project root. It scores the text against every unit
   of both CLAUDE.md files, every memory, every skill and every skill synced from claude.ai (`[synced skill]`). A
   CLAUDE.md bullet of 12 or fewer content words gets a word score (the share of its words found in your text)
   instead; any other CLAUDE.md text that short (a heading's one-line intro) is not scored. A word-score verdict is
   a candidate: read that bullet (it is one line) and confirm DUPLICATE or RELATED before you drop or merge a
   learning. The word score never makes a bullet of one or two content words a DUPLICATE, loses negation ("never",
   "not") and treats different word forms and synonyms as different words ("test" and "tests", "ask" and "asking",
   "before" and "first"), so still read the short bullets and short paragraphs of the project and global CLAUDE.md
   yourself every time. Its RELATED verdict is a candidate EXTENDS: read that unit and decide. Classify against the
   closest unit:
   - **DUPLICATE** (already stated): drop it. If it happened anyway, the existing rule failed as a rule, so the
     retrospective item becomes "make that rule enforceable" (Step 4), never a restatement.
   - **EXTENDS** (an existing unit covers the class; this is a new instance or mechanism): edit that unit in
     place, net growth at most 3 lines, deleting any sentence it supersedes.
   - **NEW** (no unit in the audit's "related" band): allowed only if it is a rule that will recur, names the
     failure it prevents, and fits in 8 lines or fewer. One-off fixes go to the session log, not a rule store.
2. **Pay for growth.** A session's net change to the rule stores should be zero or negative. Pair each NEW
   unit with a consolidation taken from the audit's "most overlapping pairs" list; if none is worth doing,
   say so in the table and let the user decide. A NEW row whose consolidation question the user has not answered is
   not approved yet; ask once more.
3. **Measure and report.** Run `node "${CLAUDE_SKILL_DIR}/audit.mjs"` before and after
   applying and put each store's before/after bytes in the final message. If MEMORY.md exceeds about 60 lines or a
   single memory exceeds about 4 KB, propose the trim in the same retrospective.
4. **Prune on a cadence.** When the audit lists more than ten pairs above its floor, the first row of the
   table is a consolidation pass, not a new learning.
5. **Stale references.** Run `node "${CLAUDE_SKILL_DIR}/audit.mjs" --stale` from the project
   root: it lists every backticked path or `npm run` script cited in the project CLAUDE.md, memory and project
   skills that no longer exists (exit 2). Each hit is fixed or deleted in the same retrospective; a rule that points
   at something that is gone is stale by definition. Hits in this skill's own files are examples; leave them.

## Step 2: Categorize Each Learning

For each: what the learning is (concrete and specific), which skill/workflow/preference it relates to, and whether it's a new rule, a fix to an existing habit, or something to stop doing.

## Step 3: Present Findings

```
| # | Learning | Category | Gate result (closest existing unit) | Where to capture | Suggested change |
|---|----------|----------|--------------------------------------|------------------|------------------|
| 1 | Verify schema before writing DB code ("the column is TEXT?") | Dev workflow | EXTENDS: skill implement-feature, Step 2 | skill: implement-feature | +2 lines in Step 2 |
| 2 | Always confirm before pushing ("don't push yet") | Preference | NEW (no match) | memory (feedback) | New 6-line memory; paired consolidation: merge memories X and Y |
| 3 | Re-read the seam after a scripted edit ("the join is broken") | Process | DUPLICATE: global CLAUDE.md "verify the artifact" | check where one can exist | The rule failed as a rule; add a check that fails on the past mistake, or a required step |
| 4 | Read the existing command before adding one ("looks good") | Process | DROPPED: not decision-changing (already the default) | none | None |
```

Every learning that reached the gate gets a row, dropped ones included; signals that are not corrections (tool output, a file) get no row, only one line under the table naming what was set aside. One sentence per cell; the Learning cell ends with its evidence (Step 1). Explain each with enough detail that the user can decide whether to adopt it. Ask for approval row by row (the user may take some rows and drop others) and edit nothing before that answer.

## Step 4: Apply (on approval) to the Right Store

Route each approved learning and make the edit:

- **Behavioral rule / process change / anti-pattern** -> `CLAUDE.md` (project `./CLAUDE.md` for project rules, global `~/.claude/CLAUDE.md` for cross-project).
- **Feedback, preference, or project fact** -> the **memory system**: write a memory file in the project's memory directory using the documented frontmatter, and add the one-line pointer to `MEMORY.md`. First check for an existing memory that already covers it and update that instead of duplicating.
- **Skill improvement** -> edit the specific `SKILL.md` (project `.claude/skills/<name>/` or global `~/.claude/skills/<name>/`). Describe the exact edit, then make it on approval. A DUPLICATE or EXTENDS whose closest unit is a `[synced skill]` is edited at that skill's source, never in the synced copy under `~/.claude/skills/synced/`, as for descriptions below.
- **Project-specific context that isn't a rule** -> a project reference doc or a `reference`-type memory.
- **A rule that failed as a rule (DUPLICATE)** -> a check where one can exist: a test, a lint rule, a script or a hook. Use `rule-to-hook` if it is installed; otherwise write the check and show it failing on the past mistake. A judgment rule with no mechanical check becomes a required step in the skill or workflow where it applies. A global rule's check is proposed where that rule lives, or say plainly that none fits.
- **A skill that did not start** -> that skill's `description:` line: add the words the user actually said, rather than a rule elsewhere telling the agent to use it. Keep it within the limits of where the skill lives (the repository's own test, if it has one; otherwise short, since every description loads in every session and an over-budget listing drops other skills' descriptions); the growth counts under "Pay for growth". Edit the source (its repository, or the file the user uploads), never a synced copy under `~/.claude/skills/synced/` or a plugin cache, which an update overwrites; when the source is out of reach, give the edit as text. Never edit another author's plugin.

If applying shows a row's class was wrong (a NEW that turned out to edit an existing unit), correct the row in the final message. Don't capture the same learning in two places. Pick the store that will actually be consulted at the right time (a rule the model must follow -> CLAUDE.md or memory; a behavior inside one workflow -> that skill file).

## What TO Encode

Process changes ("do X before Y"), anti-patterns ("X causes Y, so do Z"), format rules, missing steps that should be standard, and proven patterns that consistently worked. Write each rule as the current behavior at normal volume with its reason in one clause; the incident's date, retelling and instance list go to the session log, not the rule store.

## What NOT to Encode

One-off fixes that won't recur, content-specific decisions, temporary state (dates/deadlines), and anything that fails the decision-changing gate in Step 1.5.

## Fixes in the rule itself

Fix the general rule a failure violates rather than adding an exception for it:
- "Add a special case for X" -> find the general rule X violates.
- "Remember to check for X" -> build X into the standard process.
- "Add a reminder to do Y" -> make Y a default step, not an afterthought (a reminder is more text to read and fails the gate; a default step changes what the agent does).
- A written rule that was broken anyway -> stop rewriting it and enforce it the way Step 4 routes a DUPLICATE.
