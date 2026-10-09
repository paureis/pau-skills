---
name: session-close
description: Close a working session in a fixed order (clean tree, retrospective with the rules audit and the stale-reference check, roadmap and log updated, detailed handoff, commit and push) so the next session starts from files instead of memory. Use when the user says "close the session", "wrap up", "session close", "/session-close", when a CONTEXT WARNING appears in a tool result, or when a roadmap item meets its definition of done and the next one will not fit in what is left of the session.
argument-hint: "[optional: what the next session should focus on]"
---

# Session close

One command for the loop: work -> reflect -> prepare the next session. It runs in full and in this order; no step is
skipped silently. If a step does not apply, say why.

## Configuration

The file paths come from the project's `.claude/roadmap.json` if it exists (the same file the `session-discipline`
roadmap hook reads), otherwise the defaults:

```json
{ "roadmap": "docs/ROADMAP.md", "log": "docs/LOG.md", "handoff": "HANDOFF.md" }
```

The project's definition of done (which suites must pass before something counts as finished) lives in its own
`CLAUDE.md` or process document. This skill applies it; it does not define it.

## 0. When

- The user asks for it.
- `CONTEXT WARNING` or `CONTEXT CRITICAL` appears in a tool result: bring the current action to a clean point and
  start the close without waiting. Do not estimate context use yourself; the injected figure is authoritative.
- A roadmap item meets its definition of done and the next one does not fit in what is left of the session.

## 1. Clean state

- `git status --short`: nothing half-done. Finished work is committed with the project's definition of done.
  Unfinished work goes in a `WIP: <item> - <what is missing>` commit only if it builds and does not break the suites,
  and the handoff describes it. Never leave work uncommitted.
- `git worktree list` and `git worktree prune`; remove worktrees whose work is merged or abandoned (confirm
  `git -C <dir> status --short` is empty first).
- Scratch files hold no secrets. If the project records a "linked environment" invariant (which cloud project or
  account this checkout must point at), check it now.

## 2. Retrospective

This skill carries its own copy of the rules audit, `${CLAUDE_SKILL_DIR}/audit.mjs`. It is the same script the
`retrospective` skill uses, so this step works whether or not that skill is installed. Run it with `node` from the
project root.

- If the `retrospective` skill is installed, run it in full. If not, run the short version here: list the
  corrections the user made and the work that was redone; write each lesson that will happen again as a proposed
  line in a scratch file; score it with `node "${CLAUDE_SKILL_DIR}/audit.mjs" --check <file>`; and apply only the
  lines that are not already there and that the user approves.
- Either way, run `node "${CLAUDE_SKILL_DIR}/audit.mjs" --stale` from the project root: every path, command or script
  cited in `CLAUDE.md` and memory that no longer exists is fixed or deleted in the same session.
- Bar for adding anything: it will happen again, it names the failure it prevents, and it fits in 8 lines. If a rule
  already existed and was broken anyway, the answer is to mechanize it, not to rewrite it. Net growth of the rule
  stores is zero or negative per session (before/after bytes in the final message).
- "Nothing to add" is a valid result, and it is said.

## 3. Roadmap and log

- Roadmap: the status of every item touched (`pending` / `in progress` / `blocked (reason)` / `done (date)`). Review
  the Ideas section, if there is one: when an entry changed or looks ripe, put it to the user as a decision with a
  recommendation per entry (promote, keep, delete). That decision is the user's, not the model's. If the order stopped
  being the best one, reorder and write down why in the log.
- Log: one line per close with the date, what was done and the evidence (commit, PR, URL, test run). Take times from
  the machine clock (`date`), never from the UTC `Z` timestamps in agent notifications: a close once logged 02:40 of
  the next day for 22:40, and the next session believed a day had passed.
- Design and security documents only if the session made decisions in those areas.

## 4. Handoff

If the `handoff` skill is installed, use it in park mode. If not, write the handoff file yourself with these
sections: what the work is (two or three sentences), what was done, key learnings, the current state, the next
steps (the user's priority first), and reference material (paths and decisions, not copies). Start the file with
an instruction to the next session: say what you understand was done and your proposed next steps, then wait for
approval before changing anything.

Either way, the handoff always carries:

- **The exact state of the item in progress**: which parts are done, what is missing, which tests fail, what is in
  WIP and why.
- **The first command of the next session** (literal) and the result it should produce.
- **A start-up order**: first commands -> read-only research agents on the next item (an inventory of what already
  exists, a verification of the code to be touched, an audit) -> design discussion from their reports -> the user's
  approval -> the builder. Never the design discussion before the research.
- **What was tried and did not work** in the session, with the reason, so nobody repeats it.
- **Open questions for other people**, each with the roadmap item it blocks.
- References to documents for what is stable (`CLAUDE.md`, the process document, the roadmap), not copies: the
  handoff is long on what is specific to this session and short on what already lives in a document.
- **The models used**: the orchestrator's (from its system prompt) and the one each agent reported in its final
  report. If either changed since the previous handoff, say so here and in the final message.

## 5. Commit and push

`git add` the docs, roadmap, log, handoff and any project rule changes; commit with the message from a file
(`git commit -F <file>`); push the working branch. Then confirm `git rev-parse origin/<branch>` equals the local head
and the tree is clean. If a pull request is waiting to be merged and the project's CI skips re-running already-tested
heads, note in the handoff that this push changes the head it will test.

## 6. Final message

Short, in this order: what was done, what is in WIP, what the retrospective learned (or "nothing") with each store's
bytes before and after, and the next roadmap item with its first command. If a decision of the user's blocks the next
item, ask it as a question the user can answer directly.
