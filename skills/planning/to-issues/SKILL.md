---
name: to-issues
description: "Break a plan, spec or PRD into independently grabbable issues, each a thin vertical slice through every layer, ordered by dependency and filed after approval. Use when the user says 'break this into tasks', 'create issues', 'create tickets', 'make tasks from this', 'split this into slices' or 'break this down'."
license: MIT (adapted from mattpocock/skills; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/engineering/to-tickets
---

# To Issues

Break a plan, PRD, or feature description into independently-grabbable issues using **vertical slices**.

## Process

### 1. Gather the source

Work from whatever is already in the conversation context. If the user passes an issue reference, URL, or document, read its full content. If you haven't already explored the codebase, do so to understand the current state of the code. Read the project's domain glossary (`GLOSSARY.md`, or `CONTEXT.md` under its older name; both when both exist) and the ADRs in the area (`docs/adr/`), if they exist.

### 2. Break into vertical slices

Each issue is a **thin vertical slice** that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

**Vertical slice (correct):** "Add an order history page with its API endpoint, data query, and a basic list UI": crosses DB, API, and frontend.

**Horizontal slice (wrong):** "Create database schema for order history" then "Build API endpoint" then "Build frontend page": each layer isolated, no end-to-end feedback until all three are done.

**Wide refactor (the exception):** one mechanical change whose callers span the codebase, such as renaming a column or retyping a shared symbol. No vertical slice of it can land green, so slice it as **expand and contract**:
- one issue adds the new form beside the old;
- then one issue per batch of callers (per package or folder, sized by how much each touches), each blocked by the expand and green on its own because the old form still works;
- then one issue, blocked by every batch, deletes the old form.

When even the batches cannot stay green alone, they share an integration branch and all block a last issue that integrates and verifies.

Slices may be:
- **AFK**: can be implemented and merged without human interaction. These are self-contained enough for an AI agent to pick up.
- **HITL**: requires human interaction: an architectural decision, design review, or manual verification step.

Mark each slice clearly as AFK or HITL.

### 3. Present for approval

Present the slices as a numbered list with:
- **Title**: concise, action-oriented
- **Type**: AFK or HITL
- **Dependencies**: which slices block this one (by number)
- **Scope**: one-sentence description of the end-to-end behavior (for a wide-refactor issue: the form it adds, the callers it moves, or the form it deletes)

Ask: "Do these slices look right? Want to add, remove, or reorder any?"

### 4. Create the issues

Once approved, create each issue (as a file, a GitHub issue, or a ticket in whatever tracker the project uses). For each issue:

#### Issue Template

```
## Description
A concise description of this vertical slice. Describe the end-to-end
behavior, not layer-by-layer implementation (for a wide-refactor issue:
the form it adds, the callers it moves, or the form it deletes). Avoid
specific file paths or code snippets. They go stale fast.

Exception: if a prototype produced a snippet that encodes a decision
more precisely than prose (state machine, reducer, schema, type shape),
inline it here and note it came from a prototype.

## Acceptance Criteria
- [ ] [Observable behavior 1]
- [ ] [Observable behavior 2]
- [ ] [Edge case handled]

## Dependencies
Blocked by: [issue references, if any]

## Slice Type
AFK / HITL

## Notes
Any context the implementer needs: domain vocabulary, relevant ADRs,
or links to the parent PRD.
```

Publish issues in **dependency order** (blockers first) so you can reference real issue identifiers. Where the tracker has its own blocking link, set it and leave the template's "Blocked by" field out. Where it has none, and always for issues kept as files, write the blockers in the "Blocked by" field.

Then name the **frontier**: the issues whose blockers are all done, which can start now. At first that is the issues with no blockers; in a straight chain it is the top one.

### 5. Do NOT modify the source

Don't close, modify, or update the parent PRD or issue. The slices reference it; they don't replace it.

## Rules

- **Vertical, not horizontal.** Every slice crosses all relevant layers. No "database-only" or "frontend-only" slices unless the change genuinely is one layer. The exception is a wide refactor, sliced as expand and contract (step 2).
- **Use the project's domain vocabulary.** If `GLOSSARY.md` (or `CONTEXT.md`) defines "Evaluation," don't call it "Assessment" in the issue title.
- **Small enough to be independently testable, and to fit one fresh context window.** If a slice can't be verified on its own, it's not a real slice: it's half of one, except batches on a shared integration branch (step 2), verified by the last issue. An agent that starts with only the issue and the code can finish it in one session.
- **Order by dependencies.** Present and create in dependency order so each issue can reference its blockers.
- **Don't over-slice.** 3-8 slices for a typical feature. The count is for vertical slices, not for the expand, batch and contract issues of a wide refactor. If you're past 12, you're probably slicing too thin or the feature needs to be split into separate PRDs.
