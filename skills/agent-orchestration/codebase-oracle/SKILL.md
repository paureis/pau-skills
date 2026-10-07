---
name: codebase-oracle
description: "Research a codebase to answer architectural, design, or implementation questions with verified, evidence-based answers. Use when the user pastes a list of questions about their code, asks what the codebase actually does, wants assumptions verified before making a design decision, or says 'answer these from the code', 'research these in the codebase', 'check the code for this', or 'use the oracle'. Works in any repository and in any environment, whether files can be read directly or only project documents are available."
---

# Codebase Oracle

Answer questions about a codebase from evidence in that codebase, not from general knowledge about the framework or language it uses.

The cardinal rule: never guess. If the answer isn't in the code, say so and say where you looked.

## When to Use

- The user pastes questions from a planning, design, or grilling session
- The user asks how something currently works in their project
- The user wants to confirm whether a feature, table, route, or pattern already exists
- A decision is about to be made that depends on the current state of the code

## Workflow

### Step 1: Parse the questions

For each question, identify three things:
- What is actually being asked
- Where the answer would live (files, directories, config, schema, docs)
- What kind of evidence would settle it (implementation code, migration, config value, test, existing doc)

If several questions point at the same area of the code, group them and read that area once.

### Step 2: Orient yourself in the repo

Before answering anything, get a quick map of the project. Spend a few minutes here, it prevents wrong answers later.

- Read the dependency manifest (`package.json`, `pyproject.toml`, `go.mod`, `Gemfile`, `pom.xml`, etc.) to learn the stack and what libraries are actually installed
- List the top-level directory structure and the main source directory
- Look for a README, `docs/`, ADRs, or design notes, but treat these as claims to verify, not as facts
- Check config files and environment variable samples for feature flags, service endpoints, and integrations
- Note the test directory layout, since tests often document intended behavior better than comments

Build a short mental index of where things live in this project. Reuse it for every question rather than re-searching from scratch.

### Step 3: Research each question

Match the search approach to the question type.

**How does X work / what pattern does Y use**
Read the implementation, not the comments. Trace the path: entry point, imports, function calls, data flow, output. Note where the pattern is broken or inconsistent, since that is usually what matters for planning.

**Does X exist**
Search by filename, symbol name, import string, and route or endpoint path. If it exists, cite the exact path and line range and say what it does. If it doesn't, confirm you searched the plausible locations before declaring it missing.

**Data model and schema**
Check migrations, model or entity definitions, ORM schema files, and the queries that touch the tables. If migrations and models disagree, report the conflict.

**Configuration and environment**
Check config files, environment samples, CI definitions, and infrastructure files. Distinguish between what is configurable and what is hardcoded.

**Styling and design system**
Check global stylesheets, token or theme files, and component-level styles. Note whether values come from tokens or are hardcoded per component.

**Auth, sessions, and permissions**
Check the auth setup, middleware or route guards, session type definitions, and any role checks scattered through the code. Look for enforcement in more than one layer.

**APIs and integrations**
Check the route or handler directory, the client wrappers that call external services, and any serverless functions. Look for retry, timeout, and error handling behavior.

**History questions** (why is this like this, when did it change)
Use commit history and blame on the relevant files. Keep it targeted, a full log dump is not evidence.

### Step 4: Format the answers

Use this structure for each question:

```markdown
## Q[N]: [The question, restated in one line]

**Answer:** [Direct answer in one to three sentences]

**Evidence:**
- `path/to/file.ext` (lines X-Y): [what this shows]
- `path/to/other.ext`: [what this shows]

**Implication:** [One or two sentences on how this affects the decision being made]
```

Drop the implication line when the question is purely factual and has no bearing on a pending decision.

### Step 5: Mark confidence honestly

Every answer falls into one of three buckets. Label them.

**Verified.** Clear evidence found. Answer directly and cite the files.

**Partial.** Related code found, but the full answer isn't there. Say what you found, what's missing, and where the missing piece probably lives.

**Not found.** Searched and came up empty. State it plainly and list the locations you checked, so the user knows the search was real. Example: "I searched the API directory, the shared library folder, and all config files. There is no file upload handling anywhere, no storage client, and no multipart parsing. This would need to be built."

Never do these things:
- Answer from framework knowledge when the question is about this specific codebase. "React usually handles this by..." is not an answer.
- Treat documentation, tickets, or a PRD as proof that something was built. Verify in the code.
- Assume a pattern is consistent across the project because you saw it in one file.
- Report the happy path only. If error handling is missing, that is part of the answer.
- Pad a thin answer to make it look complete.

### Step 6: Summarize

```markdown
---

## Summary

Verified: [N]  |  Partial: [N]  |  Not found: [N]

**Findings that change the plan:**
- [Most consequential discovery]
- [Second]
- [Third]

**Still needs verification:**
- [Anything the user should confirm manually, and how]
```

## Adapting to the Environment

**Direct file access** (Claude Code, terminal, IDE)
Use `grep -rn` for symbols, imports, and strings. Use `find` and `ls` for structure. Read whole files when they are small, targeted ranges when they are large. Use `git log` and `git blame` for history questions. Prefer reading the file over inferring from a grep hit.

**Project knowledge or uploaded documents only** (chat with no repo access)
Search the available documents and prior conversations. Be explicit about the limit: "Based on the design doc, X is described this way. I can't confirm it was implemented that way without the source file." Never let a document stand in for code silently.

**Partial access**
Answer what the available evidence supports, and list the specific files the user should open to close the remaining gaps.

## Why This Matters

Answers based on expertise rather than evidence create false confidence. "The middleware matcher in `middleware.ts` line 34 excludes `/auth` and `/pricing`, here is the regex" is useful. "Middleware usually excludes auth routes" is a guess wearing a lab coat. A wrong answer here turns into a wrong design decision that costs hours to unwind. When you are unsure, say so, and name the one thing that should be checked before anyone commits to the approach.

## Optional: Project Reference Map

If you work in one repository repeatedly, add a lookup table here so the research step starts with known locations instead of a fresh search. Keep it short and update it when the structure changes.

| What you're looking for | Where it lives |
|---|---|
| Auth and sessions | |
| Route protection | |
| Database schema and migrations | |
| API routes and handlers | |
| Shared UI components | |
| Design tokens and global styles | |
| Background jobs and workers | |
| Environment and config | |