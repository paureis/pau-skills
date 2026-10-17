---
name: codebase-oracle
description: "Answer architecture, design or implementation questions from code and history, grading the evidence for each answer. Use when the user pastes questions about their code, asks what the codebase actually does, wants assumptions checked before a design decision, or says 'answer these from the code', 'research this in the codebase', 'use the oracle'."
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/how
---

# Codebase Oracle

Answer questions about a codebase from evidence in that codebase, not from general knowledge about the framework or
language it uses. The code is the evidence for what the software does. Its history (commit messages, pull requests,
issues, design docs, comments that state a reason) is the evidence for why it is that way.

The cardinal rule: never present a guess as a finding. Every answer carries one of five evidence tiers (Step 6), and
its wording matches the tier. If the evidence does not settle the question, say so and say where you looked. A
speculative answer is allowed only when it is labelled as speculative and sits next to at least one other
possibility.

Bundled files:
- `${CLAUDE_SKILL_DIR}/TIERS.md`: the five evidence tiers and their rules; read it before labelling any answer
- `${CLAUDE_SKILL_DIR}/EXPLORER-BRIEF.md`: the prompt each explorer receives for a big question
- `${CLAUDE_SKILL_DIR}/EXPLAINER-BRIEF.md`: the instructions and format for the one explanation that follows

## When to Use

- The user pastes questions from a planning, design, or grilling session
- The user asks how something currently works in their project, or why it is built the way it is
- The user wants to confirm whether a feature, table, route, or pattern already exists
- A decision is about to be made that depends on the current state of the code

## Workflow

### Step 1: Parse the questions

For each question, identify these things:
- What is actually being asked
- Whether it asks what the code does (behaviour) or why it was built that way (intent). Behaviour is answered from
  the code; intent is answered from the history first (Step 3)
- Where the answer would live (files, directories, config, schema, docs, commits, pull requests)
- What kind of evidence would settle it (implementation code, migration, config value, test, existing doc, a commit
  message or review comment that states the reason)
- Whether the question carries a guess ("is it slow because of X?"). If it does, see "When the question carries a
  guess" in Step 3
- Whether it is small or big. Big means it spans several subsystems or asks how something works end to end. A
  question that says "end to end" or names several subsystems is big, whatever else is in the list. A question in
  real doubt is small

Classify each question on its own, and state the result in one line before you start, for example "Q1 is big (end to
end); Q2 to Q5 are small." Big questions go to Step 4. Small ones are answered directly on the single-agent path in
Step 3, even when they sit in the same list as a big one. A list of small questions spread across the codebase also
counts as big when it is too wide to read in one pass; then Step 4 splits it by area.

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

**History questions** (why is this like this, when did it change, who decided)
Go to the record before you read the code for a reason: the code shows what happens, the record shows why. Keep it
targeted, a full log dump is not evidence.
1. Find the commits. `git log --follow --oneline -- <file>` follows the file through renames.
   `git log -S '<exact text>' -- <path>` finds the commits that added or removed that text, and
   `git log -G '<regex>' -- <path>` the ones whose changes match a pattern. `git blame -L <start>,<end> <file>` names
   the commit that last touched each line; read it with `git show <sha>` and its full message with
   `git log -1 --format=%B <sha>`. The last touch is often a reformat or a move, so look past it
   (`git blame -w -C`, or blame `<sha>^`) and trace back: the current shape usually comes from older decisions.
2. Read the pull request and issue record. Pull request numbers are often in merge or squash commit subjects
   (`Merge pull request #123`, `(#123)`) and issue numbers in message bodies (`Fixes #45`). Read them with the
   GitHub MCP tools when they are connected, or with the REST routes of `gh api`: `repos/<owner>/<repo>/pulls/<n>`
   for the description, `.../pulls/<n>/comments` for review comments on lines, `.../issues/<n>` and
   `.../issues/<n>/comments` for the discussion (a pull request is also an issue), and `.../pulls/<n>/reviews` for
   review summaries, which often carry the reasons and appear under no other route. When a commit subject carries no
   number, `repos/<owner>/<repo>/commits/<sha>/pulls` lists the pull requests that contain the commit. The owner and
   repository come from `git remote get-url origin`. `gh api` returns 30 items per page, so add `--paginate` for a
   long thread. Do not rely on `gh pr view`: it uses GraphQL, which some environments block. An API error is not
   evidence: a 404 can mean the token lacks permission, so report it and treat that record as not reached. On
   another host (GitLab, Bitbucket, a self-hosted forge), use its CLI or REST API for the same records.
3. Look in the repository for written reasons: CHANGELOG entries, ADRs or decision notes, comments next to the
   target that state a reason (`TODO`, `FIXME`, `HACK`, `NOTE`), and the tests added in the same commit.
4. When neither the MCP tools nor `gh` can reach the record (no network, no login, a host with no API access), say
   so, answer from git and the files in the repository, label the answer at the tier that evidence earns, and list
   the pull request and issue numbers the user can open. In a shallow clone (`git rev-parse --is-shallow-repository`
   prints `true`), history stops early: say so, and ask before fetching more.
5. An intent answer may be Unknown only after steps 1 and 2 were tried. Name which part found nothing and which
   could not be reached. Expecting the pull request record to be empty is not a reason to skip it.

**When the question carries a guess** ("is it slow because of X?", "I assume this is for performance")
The guess is one candidate, not a conclusion to confirm. Before you look, name at least one other candidate. Then
look for evidence that tells them apart: something that would be true if the guess is right and false if the other
candidate is. Report what the evidence supports, with citations, whether or not it is the user's guess, and list the
candidates you ruled out and why. For a speed question, a measurement beats a reading of the code.

### Step 4: Big questions: explorers, then one explanation

1. **Say the cost** in one line, before any explorer is launched, so a user on a tight budget can say no: "This is a
   big question, so I will run N read-only explorers on separate angles; they each read the code again, which costs
   roughly N extra passes over the area." When the user has said their usage budget is tight, wait for a yes. If the
   user declines, answer on the single-agent path in Step 3.
2. **Split it into 2 to 4 angles**, each a separate slice with its own starting point: for example the entry point
   and request path, the data model and storage, configuration, build and deployment, error handling and edge cases,
   or the history of the area. Angles should not overlap. For a list of questions, group the questions by area and
   give each group to one explorer.
3. **Launch the explorers in one message** with the Agent tool (named Task in some Claude Code versions). Read
   `${CLAUDE_SKILL_DIR}/EXPLORER-BRIEF.md`, fill in its fields for each angle, and paste the whole text as that
   explorer's prompt. Paste `${CLAUDE_SKILL_DIR}/TIERS.md` whole into its tiers field, examples included. A subagent
   cannot resolve `${CLAUDE_SKILL_DIR}` and does not inherit this skill's allowed tools, so paste the text, never the
   path. Use the `Explore` agent type where it exists: it is read only and may run on a smaller model, so for a deep
   angle set the Agent tool's `model` field to a stronger one. Otherwise use a general-purpose subagent; the brief
   tells it to stay read only.
4. **Write one explanation** once every explorer has returned, following `${CLAUDE_SKILL_DIR}/EXPLAINER-BRIEF.md`.
   Write it yourself, or send that brief with every explorer's report pasted in to one explainer subagent when the
   reports are too long to hold alongside the rest of the work. Where explorers disagree, read the code yourself and
   settle it, or show both sides with citations. Present an explainer's text with light edits at most. Never raise a
   tier it gives; lower any tier its evidence does not earn, and say that you did.
5. **The format** is Overview, Key concepts, How it works, Where things live, Gotchas. Drop a section only when it
   would be empty; Where things live applies whenever the answer names more than one file or place. Each claim
   carries its tier, and the summary counts the tiers (Step 7). For a list of questions, keep the per-question format
   of Step 5 instead.

When you cannot launch subagents (inside a subagent, or with no Agent or Task tool, as when the skill is uploaded to
claude.ai), skip the launch: explore the angles one after another yourself, with the same brief for each, then write
the explanation.

### Step 5: Format the answers

Use this structure for each question:

```markdown
## Q[N]: [The question, restated in one line]

**Answer:** [Direct answer in one to three sentences, worded for its tier]

**Tier:** [Direct | Supported | Inferred | Speculative | Unknown]

**Evidence:**
- `path/to/file.ext` (lines X-Y): [what this shows]
- `abc1234` or pull request #N: [what the author wrote, quoted when it states the reason]

**Other candidates:** [When the question carried a guess or the answer is speculative: the other possibilities and
what the evidence says about each]

**Implication:** [One or two sentences on how this affects the decision being made]
```

Drop the implication line when the question is purely factual and has no bearing on a pending decision, and the
other candidates line when there were none to weigh. When parts of one answer sit at different tiers, tag each
evidence line with its tier in brackets, for example `[inferred]`.

### Step 6: Label each answer with its evidence tier

Every claim sits in one of five tiers, and the tier decides what the answer may say. Read
`${CLAUDE_SKILL_DIR}/TIERS.md` before you label any answer: it gives what earns each tier, the wording each allows,
how to tier evidence from outside the repository, and the rules that go with the tiers. In short:

- **Direct**: the evidence answers the question on its own (the whole code path read or run, a search that proves an
  absence, or an author's stated reason for the exact thing asked). Plain wording, cited.
- **Supported**: several pieces of indirect evidence agree. "The evidence points strongly to X:" and each piece.
- **Inferred**: a reasonable reading that nothing states, or a link you cannot see whose behaviour is documented.
  Hedged, naming what it was inferred from.
- **Speculative**: thin evidence, other explanations fit as well. "One possibility is X, but there is no direct
  evidence", always next to another possibility.
- **Unknown**: the available evidence cannot settle it. Say what you searched, where, and who or what could settle
  it. For intent, only after the record lookup in Step 3 was tried.

Never do these things:
- Answer from framework knowledge when the question is about this specific codebase. "React usually handles this by..." is not an answer.
  General knowledge may suggest where to look; how to tier what it suggests is in `${CLAUDE_SKILL_DIR}/TIERS.md`.
- Treat documentation, tickets, or a PRD as proof that something was built. They are evidence of intent; what was
  built is in the code.
- Assume a pattern is consistent across the project because you saw it in one file.
- Report the happy path only. If error handling is missing, that is part of the answer.
- Confirm the user's guess without looking for evidence against it.
- Pad a thin answer to make it look complete, or raise its tier to make it sound sure.

### Step 7: Summarize

```markdown
---

## Summary

Direct: [N]  |  Supported: [N]  |  Inferred: [N]  |  Speculative: [N]  |  Unknown: [N]

**Findings that change the plan:**
- [Most consequential discovery]
- [Second]
- [Third]

**Still needs verification:**
- [Anything the user should confirm manually, and how: who to ask, which pull request to open, what to measure]
```

The counts are of tier labels in the finished text, so anyone can recount them: each answer's Tier line and each
bracketed tier tag on a claim or evidence line counts once. Count after the text is written, not from memory.

## Adapting to the Environment

**Direct file access** (Claude Code, terminal, IDE)
Use `grep -rn` for symbols, imports, and strings. Use `find` and `ls` for structure. Read whole files when they are
small, targeted ranges when they are large. Use `git log`, `git blame` and the pull request record (Step 3) for
history questions. Prefer reading the file over inferring from a grep hit.

**Project knowledge or uploaded documents only** (chat with no repo access)
Search the available documents and prior conversations. Be explicit about the limit: "Based on the design doc, X is described this way. I can't confirm it was implemented that way without the source file." Never let a document stand in for code silently.

**Partial access**
Answer what the available evidence supports, and list the specific files the user should open to close the remaining gaps.

**No way to launch subagents** (inside a subagent, or no Agent or Task tool, as on claude.ai)
Big questions run their angles one after another (Step 4). Everything else is unchanged.

## Why This Matters

Answers based on expertise rather than evidence create false confidence. "The middleware matcher in `middleware.ts`
line 34 excludes `/auth` and `/pricing`, here is the regex" is useful. "Middleware usually excludes auth routes" is a
guess wearing a lab coat. A wrong answer here turns into a wrong design decision that costs hours to unwind. The same
holds for intent: a confident "this exists because..." with nothing behind it gets acted on as if it were the record.
When you are unsure, say so, and name the one thing that should be checked before anyone commits to the approach.

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
