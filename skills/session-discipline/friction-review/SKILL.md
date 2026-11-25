---
name: friction-review
description: "Review this project's recent sessions for friction that repeats (search churn, costly tool calls, missing access, unwired checks) and propose fixes."
disable-model-invocation: true
argument-hint: "[number of sessions, default 30, or a session id]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from mattpocock/skills; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/engineering/retro
---

# Friction review

The user typed `/friction-review` to improve the agent's environment for future sessions: what made the agent slow,
wasteful or blind in this project, measured across the last sessions, so that a candidate is friction that repeats and
not a one-off. You propose changes and make only the ones the user picks. This is not a memory system: every change
lands in a file of the project.

Run it again after the next batch of sessions: the review is a loop, and each round measures the changes of the last.

## Privacy, for every step

Session files hold tool results, other people's words, and sometimes secrets or personal data.
- Refer to evidence by pointer: a session file and line. Describe it in a few words of your own; do not quote it.
- Never write a secret, an email, a person's name or a machine path into a proposal, a commit message, a code
  comment, a test fixture or anything posted.
- A check that proves a fix reproduces the friction with synthetic input, never pasted session text.
- Read only this project's transcript folders, never a glob across every project. The script finds them for you.
- `friction.mjs` redacts what it can recognise. It is a net, not a guarantee.

## 1. Scope

From the arguments: a whole number N reads the last N sessions; a session id reads that one session; nothing reads
the last 30. Anything else: ask which of the two the user means.

## 2. Run the script

From the project root:

```bash
node "${CLAUDE_SKILL_DIR}/friction.mjs" --last <N>
node "${CLAUDE_SKILL_DIR}/friction.mjs" --session <id>
```

Node 20 or later, no dependencies, read only. The other options: `--skip <id>` leaves a session out (repeat it for
more), `--keep-recent` keeps the newest session, which is left out by default when it changed in the last 10 minutes
(it is most likely this one), `--repo <dir>` and `--projects <dir>`. Exit 2 is a usage error, exit 1 a refusal (not a
git repository, a session id that is not found).

It prints a header (the projects folder, the sessions and their date range, the subagent transcripts, the unreadable
lines, the thresholds), then two parts:
- **Project**: the check commands the project defines, the guardrails (CI files, pre-commit, Claude Code hooks), which
  guardrail names each check, a "no guardrail" finding when there is no CI and no pre-commit, and the instruction
  files with their size in tokens. It knows package.json, Make, pyproject.toml, pytest.ini, tox.ini, noxfile.py,
  Cargo and Go; Gradle, Maven, .NET, Ruby and PHP are out of scope, so read their build files yourself.
- **Sessions**: per kind, each signal as "n in k of N sessions" with up to three pointers. A pointer is
  `<folder>/<file>:<line>`, the tool and its target; a step from a subagent ends with `(subagent: <agent type>)`.

A transcript is the main session file or one subagent file. Searches before the first edit, repeated reads and
repeated commands are counted per transcript, since each agent has its own context. Coding standards and no-ops in
steering files are not counted: they need reading.

Four navigation lines show whether scattered or oversized files cost turns:
- **Files read in pieces**: a file of the project read in 2 or more Read ranges (an offset, a limit or both) in one
  transcript. The same range read twice is a repeated read, not a second piece.
- **New files made with Write**: a Write inside the project whose result says it created the file.
- **New files in commits**: the paths that `git log --diff-filter=A` lists over the days of the sessions read. The
  days are UTC days taken from the modification times of the session files, not from when the work started. Merges,
  renames and commits with no parent are not counted: the edge commit of a shallow clone lists every file as added.
  When the history cannot be read (a missing object, for example), the line says so and the rest still prints.
- **Reads and searches before the first edit in each folder**: per transcript, the Read, Grep and Glob calls and the
  shell commands that read or search (the first command of a pipe chain is a search, `cat`, `head`, `tail`, `nl` or
  `sed -n`), counted until the first edit in a folder that transcript has not edited yet. A command that writes a file
  is not a read: an output redirection (`>` or `>>`, but not `2>&1`, `>&2` or one for errors only), a heredoc
  (`cat > notes.md <<'EOF'`) or `sed -i`. Every edit of the project starts the count again. An edit call counts
  whatever its result, and edits made through the shell (`sed -i`, a heredoc) are not seen.

If the header shows 0 sessions, or says no transcript folder matches this repository, check that you ran it from the
project root (or pass `--repo`) and that the sessions live in the projects folder it names (`CLAUDE_CONFIG_DIR` moves
it; pass `--projects`). If there are still none, report the project part alone and say no session was read.

## 3. Check each count

A count is a lead, not evidence. For each signal you might act on, open two of its pointers and read a few lines
around each. The file is `<projects folder>/<folder>/<file>`, at that line: the header names the projects folder, and
the folder is printed with the home folder part as `~`, so it is the folder there whose name ends with the rest. Drop
a signal whose pointers do not show the friction the count suggests, and say so.

## 4. Sort into kinds

Sort what holds up into the seven kinds in [KINDS.md](KINDS.md), each with its "use when" and the change it calls
for: navigation, automated checks, coding standards, instruction file too large, tool economy, no-ops in steering
files, information access. Read the instruction files for the two kinds the script does not count.

A candidate repeats: it appears in 2 or more sessions, or more than once in one session. Leave out the rest. "No
guardrail" is a candidate on its own, whatever the counts.

## 5. Present, then wait

List the candidates by severity: sessions affected first, then cost (tokens, failed calls, time). For each: the
counts, two pointers, the change at the highest layer that works (a check that runs on its own beats a pointer in a
doc, which beats a line in CLAUDE.md), and the file it changes. Change nothing yet.

Ask which to make. AskUserQuestion takes 2 to 4 options per question and up to 4 questions per call: group the
candidates, up to 4 per question with multiSelect, over several questions, and ask again for more. With one candidate,
or without that tool, ask a plain numbered question.

## 6. Make what the user picks

- One commit per change, following the project's own rules for commits, tests and checks.
- A new check: prove it on a synthetic reproduction first (it fails on input that shows the friction, and passes once
  the input is fixed). If `rule-to-hook` is installed, use it for a check that becomes a Claude Code hook; without
  it, add the hook to `.claude/settings.json` by hand and prove it the same way.
- A judgment rule for review: if `review-triage` is installed, use its checklist format; see KINDS.md.
- When a change adds text an agent reads (a pointer, a doc, a skill), use `writing-for-agents` for the style if it is
  installed; otherwise keep it short and literal.
- Never push.

## 7. Report

- The sessions read and their date range (from the header).
- What you proposed, what the user picked, and what changed, with the commits.
- What you dropped at step 3, and why.
- The next review: type `/friction-review` again after the next N sessions.

## How it differs

- `retrospective`, if it is installed, covers one session: the user's corrections and redone work in it.
- For code mistakes across the whole history, from review comments, fix commits and what the user typed, the user can
  type `/agent-friendly-audit`, if it is installed.
- `instructions-audit` reviews the instruction files themselves (duplicates, contradictions, stale paths); use it, if
  it is installed, for the "instruction file too large" kind. This skill only measures their size.
