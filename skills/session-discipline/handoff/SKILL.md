---
name: handoff
description: "Transfer full working context from this session to a future one so work resumes cleanly after a pause. Use when the user says \"handoff\", \"hand off\", \"wrap up for now\", \"pause here\", \"let's continue this later\", when a session is getting long and context may be degrading (suggest it proactively then), or when switching focus within the same project. This is about pausing/resuming a SESSION, not shipping finished work. Two modes: park (default: write a handoff file the next session reads) or immediate (print the handoff inline to copy into a new chat or another tool). General-purpose; works in any project."
---

# Handoff

Capture the full working context of this session into a structured handoff so a future session (a fresh Claude Code session, a new chat, or another tool) can pick up exactly where this one stopped, with no prior context.

## Modes

- **Park (default in Claude Code)**: write the handoff to a file the next session reads. Default path: `HANDOFF.md` in the current working directory (mention it can be gitignored or deleted after use; the user may specify a different path). To resume: a new session reads that file and follows the instructions at its top.
- **Immediate (clipboard)**: print the handoff inline so the user can copy it into a new chat or another tool. Use this when the next session is somewhere this filesystem isn't shared.

Ask which mode if it isn't obvious; default to park.

## Step 0: Retrospective gate (do this BEFORE writing the handoff)

The retrospective is the step that gets squeezed out between finishing the work and handing
off, even when a written rule requires it. Before Step 1, state one of these to the user:

- **"Retrospective already ran this session"**, and say what it produced (including "nothing
  worth adding", which is a legitimate result).
- **"Running the retrospective now"**: if the `retrospective` skill is installed, invoke it, finish it, then come back
  and write the handoff. If it is not, run this short version: list the corrections the user made and the work that
  was redone; for each one that will happen again, propose one line for `CLAUDE.md` or memory, after checking that
  no existing line already says it; show the exact lines and apply only the ones the user approves.
- **"Skipping the retrospective because <reason>"**, only for a genuinely trivial session
  (a one-line fix, a pure question). If corrections were made, work was redone, or a phase
  closed, it is not trivial.

Say which of the three applies in every handoff. The retrospective's findings often belong in
the handoff's **Key Learnings** section, which is why it runs first.

## Step 1: Scan the Conversation

Review the full session and extract:

- **What was accomplished**: decisions made, artifacts created (files, code, plans, docs), problems solved.
- **What was learned**: gotchas, constraints, and corrections discovered during the work; user preferences that surfaced (tone, format, approach); things that didn't work and why.
- **Where work stopped**: the exact point the session ends; incomplete tasks; open questions.
- **What's next**: the user's stated priorities (these always take precedence over your own analysis), logical next steps, and any pending decisions the user needs to make.

## Step 2: Build the Handoff

Produce this structure (as the file contents in park mode, or the inline block in immediate mode):

```markdown
## Continue: [brief title of the project/task]

**Before changing anything, tell me:**
1. What you understand was already done
2. Your proposed next steps
3. Then wait for my approval. Reading files and running the read-only first commands listed below need no approval.

---

### Context
[What this project/task is about. 2 to 3 sentences.]

### What's Been Done
[Specific deliverables and decisions, not vague.]

### Key Learnings
[Gotchas, constraints, preferences, corrections, so the next session doesn't repeat mistakes.]

### Current State
[Exactly where things stand: what's complete, in progress, blocked.]

### Next Steps
1. [User's stated priority, if given; always first]
2. [Logical next action]
3. [Further actions as needed]

### Reference Material
[Essential content the next session needs: key decisions, specs, style notes, file paths, snippets. Only what's essential, not a transcript.]
```

## Step 3: Deliver

- **Park:** write the file, then tell the user the path and that a new session can resume by reading it.
- **Immediate:** present the block in an easy-to-copy form and tell the user to paste it into a new session.

## Key Rules

- **Assume no prior context**: the receiving session knows nothing about this conversation.
- **User's direction comes first**: if the user said what to focus on next, it leads Next Steps.
- **Concrete, not vague**: "drafted the proposal with 5 sections" not "worked on the proposal".
- **Keep the approval gate**: the next session confirms its understanding before changing anything, and may read and run read-only checks first.
- **Concise, not a transcript**: enough to continue effectively, no more.
- **Preserve content that matters**: put specific text, code, specs, or decisions in Reference Material rather than just describing them.
- **Skip the noise**: abandoned dead ends, process meta-talk, superseded drafts, and context the user would naturally re-supply.
