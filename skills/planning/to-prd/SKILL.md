---
name: to-prd
description: "Write a PRD from what the conversation already decided, without interviewing, and save it as a markdown file. Use when the user says 'write a PRD', 'create a PRD', 'make this into a PRD', 'to-prd', or wants a finished grilling or planning session captured as a spec."
license: MIT (adapted from mattpocock/skills; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/main/skills/engineering/to-prd
---

# To PRD

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user. Just synthesize what you already know.

## Process

1. **Explore the repo** to understand the current state of the codebase, if you haven't already.

2. **Sketch out the major modules** you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules: modules that encapsulate a lot of functionality behind a simple, testable interface that rarely changes.

   Check with the user that these modules match their expectations. Check which modules they want tests written for.

3. **Write the PRD** using the template below.

4. **Save the PRD** as a markdown file. If the user wants it submitted to their issue tracker (a GitHub issue, a Jira ticket, or whatever the project uses), help them do that.

## PRD Template

### Problem Statement

The problem that the user is facing, from the user's perspective.

### Solution

The solution to the problem, from the user's perspective.

### User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

> As a [role], I want [capability], so that [benefit]

This list should be extremely extensive and cover all aspects of the feature, including edge cases and error states.

### Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

### Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

### Out of Scope

A description of the things that are out of scope for this PRD. Be explicit: this prevents scope creep.

### Further Notes

Any further notes about the feature.

## Rules

- **No interviewing.** This skill synthesizes: it doesn't interrogate. If the plan is not decided yet, settle the open decisions with the user first (use `grill-me` for this if it is installed), then run this one.
- **Module depth matters.** When sketching modules, flag shallow modules (interface nearly as complex as implementation) and suggest deepening them.
- **No file paths or code snippets in the PRD.** These go stale immediately. Describe modules by what they do, not where they live.
- **User stories should be exhaustive.** If you can think of 10, write 20. Cover happy paths, error states, edge cases, and accessibility.
