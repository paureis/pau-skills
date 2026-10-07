---
name: to-issues
description: "Break any plan, spec, or PRD into independently-grabbable issues using vertical slices. Use when user says 'break this into tasks', 'create issues', 'create tickets', 'to-issues', 'make tasks from this', 'split this into slices', 'break this down', or wants to decompose a PRD, plan, or feature description into trackable work items. Chains naturally after to-prd or grill-with-docs."
license: MIT (adapted from mattpocock/skills; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/main/skills/engineering/to-issues
---

# To Issues

Break a plan, PRD, or feature description into independently-grabbable issues using **vertical slices**.

## Process

### 1. Gather the source

Work from whatever is already in the conversation context. If the user passes an issue reference, URL, or document, read its full content. If you haven't already explored the codebase, do so to understand the current state of the code.

### 2. Break into vertical slices

Each issue is a **thin vertical slice** that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

**Vertical slice (correct):** "Add an order history page with its API endpoint, data query, and a basic list UI": crosses DB, API, and frontend.

**Horizontal slice (wrong):** "Create database schema for order history" then "Build API endpoint" then "Build frontend page": each layer isolated, no end-to-end feedback until all three are done.

Slices may be:
- **AFK**: can be implemented and merged without human interaction. These are self-contained enough for an AI agent to pick up.
- **HITL**: requires human interaction: an architectural decision, design review, or manual verification step.

Mark each slice clearly as AFK or HITL.

### 3. Present for approval

Present the slices as a numbered list with:
- **Title**: concise, action-oriented
- **Type**: AFK or HITL
- **Dependencies**: which slices block this one (by number)
- **Scope**: one-sentence description of the end-to-end behavior

Ask: "Do these slices look right? Want to add, remove, or reorder any?"

### 4. Create the issues

Once approved, create each issue (as a file, a GitHub issue, or a ticket in whatever tracker the project uses). For each issue:

#### Issue Template

```
## Description
A concise description of this vertical slice. Describe the end-to-end
behavior, not layer-by-layer implementation. Avoid specific file paths
or code snippets. They go stale fast.

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

Publish issues in **dependency order** (blockers first) so you can reference real issue identifiers in the "Blocked by" field.

### 5. Do NOT modify the source

Don't close, modify, or update the parent PRD or issue. The slices reference it; they don't replace it.

## Rules

- **Vertical, not horizontal.** Every slice crosses all relevant layers. No "database-only" or "frontend-only" slices unless the change genuinely is one layer.
- **Use the project's domain vocabulary.** If CONTEXT.md defines "Evaluation," don't call it "Assessment" in the issue title.
- **Small enough to be independently testable.** If a slice can't be verified on its own, it's not a real slice: it's half of one.
- **Order by dependencies.** Present and create in dependency order so each issue can reference its blockers.
- **Don't over-slice.** 3-8 slices for a typical feature. If you're past 12, you're probably slicing too thin or the feature needs to be split into separate PRDs.
