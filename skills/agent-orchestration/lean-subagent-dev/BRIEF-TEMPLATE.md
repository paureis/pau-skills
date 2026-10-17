# Subagent brief template

Copy this for each task, fill every bracket, and delete the guidance lines in parentheses. The subagent has not seen
this conversation, so anything it needs must be written here. Keep it to one screen; a longer brief usually means the
task should be split.

Before launching, check the filled brief: no bracket placeholder and no guidance line in parentheses is left anywhere
above the report-format block. The report block keeps its brackets on purpose; they show the subagent the shape to
fill. An optional field you do not need is deleted or says "none", never left in brackets. If you cannot fill a field,
the task is not scoped yet: do not launch it.

A task of one command may get a single paragraph instead of this template, as long as the paragraph names the goal,
the files, the command that must pass and the report format, and the standing orders follow it unchanged.

---

## Task: [name]

### Goal

[One to three sentences: what is different when this is done, from a user's or caller's point of view.]

[Link or paste the issue, plan section or acceptance criteria.]

### Files

You may create, edit and delete these:

- [path or glob]

Do not touch:

- [paths that are out of scope, shared generated files such as lockfiles and snapshots, the changelog if the
  orchestrator owns it]

If you need a change outside the files above, stop and say so in your report instead of making it.

### Rules that apply

(Quote the project rules that matter for this task, word for word, with where they come from. The subagent may see
the project's instruction files, but it will not know which rules matter here.)

- [rule] ([file, section])

### Done when

All of these pass, and you ran them yourself after your last change:

```
[the exact test command for the affected area]
[the lint or typecheck command, if the project has one]
```

[Any extra observable check: this command prints X, this input is rejected with Y.]

### Stop and report, instead of carrying on, if

- the plan assumes something about the code or the environment that turns out to be false
- the change needs files outside the list above
- a check fails for a reason outside this task
- [anything specific to this task]

### Standing orders

(The same block, word for word, in every brief and every fix-round message of the session. When you catch yourself
repeating an instruction to a subagent, add it here.)

- Commit your work in small, described commits. Leave nothing uncommitted.
- **Commit, never push.** Do not push, open or merge a pull request, tag, or release.
- Write the test before the code for any new behaviour, and watch it fail first.
- Do not skip, disable or weaken a test or a check to make it pass.
- [the project's rules for every task, such as its style rules, quoted; or delete this line]

### Report back in exactly this format

```
Task: [name]
Commits: [n]   First: [sha]   Last: [sha] [subject]
What changed: [one line per file or group of files]
Checks: [command: PASS | FAIL, with the failing output]
Outside my scope, not done: [file: what and why, or "none"]
Anything I was unsure about: [every doubt, guess or shortcut, however small, or "none"]
```
