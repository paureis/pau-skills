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

Bundled files, open them when Step 4 sends you there:
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
- Whether it is small or big. Big means it spans several subsystems, asks how something works end to end, or is a
  list of questions spread across the codebase. Big questions go to Step 4. Everything else, and anything in doubt,
  stays on the single-agent path in Step 3

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
   `.../issues/<n>/comments` for the discussion (a pull request is also an issue). When a commit subject carries no
   number, `repos/<owner>/<repo>/commits/<sha>/pulls` lists the pull requests that contain the commit. The owner and
   repository come from `git remote get-url origin`. Do not rely on `gh pr view`: it uses GraphQL, which some environments block. On
   another host (GitLab, Bitbucket, a self-hosted forge), use its CLI or REST API for the same records.
3. Look in the repository for written reasons: CHANGELOG entries, ADRs or decision notes, comments next to the
   target that state a reason (`TODO`, `FIXME`, `HACK`, `NOTE`), and the tests added in the same commit.
4. When neither the MCP tools nor `gh` can reach the record (no network, no login, a host with no API access), say
   so, answer from git and the files in the repository, label the answer at the tier that evidence earns, and list
   the pull request and issue numbers the user can open. In a shallow clone (`git rev-parse --is-shallow-repository`
   prints `true`), history stops early: say so, and ask before fetching more.

**When the question carries a guess** ("is it slow because of X?", "I assume this is for performance")
The guess is one candidate, not a conclusion to confirm. Before you look, name at least one other candidate. Then
look for evidence that tells them apart: something that would be true if the guess is right and false if the other
candidate is. Report what the evidence supports, with citations, whether or not it is the user's guess, and list the
candidates you ruled out and why. For a speed question, a measurement beats a reading of the code.

### Step 4: Big questions: explorers, then one explanation

Say the cost in one line before starting, so a user on a tight budget can say no: "This is a big question, so I will
run N read-only explorers on separate angles; they each read the code again, which costs roughly N extra passes over
the area." When the user has said their usage budget is tight, wait for a yes. If the user declines, answer on the
single-agent path in Step 3.

1. **Split it into 2 to 4 angles**, each a separate slice with its own starting point: for example the entry point
   and request path, the data model and storage, configuration, build and deployment, error handling and edge cases,
   or the history of the area. Angles should not overlap. For a list of questions, group the questions by area and
   give each group to one explorer.
2. **Launch the explorers in one message** with the Agent tool. Read `${CLAUDE_SKILL_DIR}/EXPLORER-BRIEF.md`, fill
   in its fields for each angle, and paste the whole text as that explorer's prompt. A subagent cannot resolve
   `${CLAUDE_SKILL_DIR}` and does not inherit this skill's allowed tools, so paste the text, never the path. Use the
   `Explore` agent type where it exists: it is read only and may run on a smaller model, so for a deep angle set the
   Agent tool's `model` field to a stronger one. Otherwise use a general-purpose subagent; the brief tells it to stay
   read only.
3. **Write one explanation** once every explorer has returned, following `${CLAUDE_SKILL_DIR}/EXPLAINER-BRIEF.md`.
   Write it yourself, or send that brief with every explorer's report pasted in to one explainer subagent when the
   reports are too long to hold alongside the rest of the work. Where explorers disagree, read the code yourself and
   settle it, or show both sides with citations. Present an explainer's text with light edits at most, and never
   change its tier labels.
4. **The format** is Overview, Key concepts, How it works, Where things live, Gotchas, dropping any section that does
   not apply. Each claim carries its tier, and the summary counts the tiers. For a list of questions, keep the
   per-question format of Step 5 instead.

When this skill runs inside a subagent, it cannot launch subagents: explore the angles one after another yourself,
with the same brief for each, then write the explanation.

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
evidence line with its tier.

### Step 6: Label each answer with its evidence tier

Every claim sits in one of five tiers. The tier decides what the answer may say.

**Direct.** The evidence answers the question on its own.
- Behaviour: you read the code along the whole path the question is about, from entry point to result, including
  the branch that applies; or you ran it and saw the result.
- Absence: a thorough search proves something is not there. Say where you looked and what you searched for. Example:
  "I searched the API directory, the shared library folder, and all config files. There is no file upload handling
  anywhere, no storage client, and no multipart parsing. This would need to be built."
- Intent: an author wrote the reason down, in a commit message, a pull request description or review comment, an
  issue, a design doc, or a code comment that states a reason ("clamp to 100 because the upstream API rejects larger
  values").
- Wording: plain and cited. "X does Y (`file`, lines A-B)." "X exists because Z (pull request #N)."

**Supported.** Several pieces of indirect evidence agree, and none states the answer outright.
- Behaviour: you read most of the path, and the rest is pinned by tests or by call sites that all agree.
- Intent: for example the pull request title says "speed up export", its issue is labelled as a performance bug, and
  the tests added with it all use very large inputs.
- Wording: "The evidence points strongly to X:" followed by each piece, cited.

**Inferred.** A reasonable reading that nothing states.
- Behaviour: you read part of the path and filled the rest from names, one call site, or a convention seen elsewhere;
  or the path runs through code you cannot see (a dependency, a remote service, configuration set at deploy time).
- Intent: for example the change was merged the same day an incident was reported, so it was likely a hotfix.
- Wording: hedged, naming what it was inferred from. "Given A and B, X seems likely." "X appears to", "likely",
  "is consistent with".

**Speculative.** A plausible idea on thin evidence, where other explanations fit as well.
- Wording: "One possibility is X, but there is no direct evidence." Always next to at least one other possibility,
  so the user can say which is right.

**Unknown.** The available evidence cannot settle the question: the path leaves the repository, the history was
squashed, the pull request record cannot be reached, nobody wrote the reason down.
- Wording: say what you searched, where, and for what, and who or what could settle it (the author, a runtime log,
  the pull request record). "I searched X, Y and Z" is useful; "I couldn't find out" is not.

Rules that go with the tiers:
- Confidence words ("because", "the reason is", "was designed to", "fixes", "the team decided") need direct or
  supported evidence, with the citation right next to them. Never use them for an inference.
- Never cite code as evidence for its own intent. Code shows what happens, not why it was meant to. "It retries three
  times, so it was designed for a flaky network" is a guess. Intent comes from commit messages, pull request
  discussion, issues, design docs and comments that state a reason, each at the tier its wording earns.
- An absence of evidence about intent is not evidence: "no one mentioned security, so it was not a concern" is not
  a finding. This is different from a search that proves code is absent, which is direct.
- Do not fit a tidy reason to messy history. A pattern repeated across files may be copy and paste, not a decision.
- When sources disagree, show both with citations and let the user decide. When a comment or doc disagrees with the
  code about behaviour, the code wins, and the conflict is part of the answer.
- Two explorers that repeat the same inference still give one inference. Merging reports never raises a tier.

Never do these things:
- Answer from framework knowledge when the question is about this specific codebase. "React usually handles this by..." is not an answer.
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

## Adapting to the Environment

**Direct file access** (Claude Code, terminal, IDE)
Use `grep -rn` for symbols, imports, and strings. Use `find` and `ls` for structure. Read whole files when they are
small, targeted ranges when they are large. Use `git log`, `git blame` and the pull request record (Step 3) for
history questions. Prefer reading the file over inferring from a grep hit.

**Project knowledge or uploaded documents only** (chat with no repo access)
Search the available documents and prior conversations. Be explicit about the limit: "Based on the design doc, X is described this way. I can't confirm it was implemented that way without the source file." Never let a document stand in for code silently.

**Partial access**
Answer what the available evidence supports, and list the specific files the user should open to close the remaining gaps.

**Inside a subagent** (no Agent tool)
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
