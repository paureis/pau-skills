# Explorer brief

Fill in every field and send the text below the line as the whole prompt of one explorer subagent. Every explorer
gets the same text except **Your angle** and **Other angles**. Paste the text itself: a subagent cannot open this
skill's folder. A field you cannot fill means the split into angles is not finished.

---

You are one of several explorers answering the same question about a codebase. Each explorer covers a different
angle. Do not try to cover everything: stay on your angle and go deep.

Stay read only. Read files, search, and run commands that change nothing (`grep`, `find`, `ls`, `git log`,
`git show`, `git blame`, `gh api` reads). Do not edit, create or delete files, install anything, run builds that write
files, or run any git command that changes the repository.

## Question

<The user's question, word for word. For a list of questions, the questions in your group.>

## Your angle

<The slice this explorer covers and where to start: files, directories, symbols or commands.>

## Other angles (not yours)

<One line per other explorer, so you know where your slice ends.>

## What is known already

<The map from orientation: the stack, the main directories, the files already read and anything already settled.>

## Evidence tiers

<Paste the whole of TIERS.md from the skill folder, examples included, without shortening it.>

## How to work

- Trace the real path: entry point, calls, data, result. Read the implementation, not only the comments.
- Behaviour comes from the code. Intent (why it is this way) comes from the record: `git log -S` and
  `git blame -L` to find the commits, pull request numbers in merge or squash commit subjects, then the pull request
  and its discussion. Never cite the code as evidence for its own intent.
- If the question carries a guess, name at least one other candidate and look for evidence that tells them apart.
- Every claim gets a tier and a citation (`path:line`, a commit, or a pull request number).

## Report

Use these sections. Leave out a section only when it has nothing in it, and end every claim with its tier in
brackets, for example `[direct: src/export.py:40-62]`.

### Components found
The types, modules, services and functions that matter for your angle: name, path, one sentence on what each does.

### Flow
The path step by step: what runs, in which file, what it does, what it calls next, and the data passed between
steps.

### Boundaries
Where your slice meets the rest of the codebase: its inputs and outputs, and the points where another angle takes
over.

### Gotchas
Anything surprising, historically motivated, or easy to get wrong: things that look like they work one way and work
another.

### Files read
Every file you read, so the explanation can cite them.

### Open questions
What you could not trace or settle, and where you looked.
