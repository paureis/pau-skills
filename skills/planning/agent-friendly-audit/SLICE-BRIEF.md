# Slice brief

Give each mining subagent the common part below, its own slice section, the focus, and the source line from step 2
(where the slice is and how much is there).

## Common part (every slice)

You are mining one slice of a project's history for mistakes that agents (or people) keep making in this project.
You read only. Do not edit, create, commit or post anything, and do not run anything that changes the repository or
a remote.

Look for corrections: something was done, then someone said it was wrong or changed it back. For each, write down
what was wrong and what the right way was, in your own words.

Return a list of candidate classes, most instances first. A class is one kind of mistake with one fix, named by the
mistake ("reads configuration from the environment instead of the config loader"), not by the area ("config").

```
Class: <the mistake, one line>
Right way: <what should have been used or done, one line>
Instances: <n>
- <pointer>: <what happened, a few words of your own>
- <pointer>: ...
Where it lives: <files or modules, if known>
Already enforced by: <lint rule, test, hook, CI step | nothing found>
```

Pointers: a commit hash, a pull request number and comment id, a transcript file and line, a `file:line`. Then:
- **Privacy.** Do not copy raw text into your answer. Quote at most the few words a finding needs, never a secret,
  token, email, person's name or machine path. Paraphrase the rest.
- List single instances too, under "Seen once"; the caller merges them with other slices.
- If the slice is empty, or holds only bot output, say so in one line and stop. Do not stretch thin evidence.
- End with one line: what you read (counts) and what you could not read.

## Slice: review comments

Read inline review comments and conversation comments on pull requests, through the source given (GitHub MCP tools
or `gh api` REST routes). For each human comment that asks for a change, find whether the change was made and what
it was. Signals: the same request on more than one pull request; "we use X here", "don't", "again", "please use";
a comment followed by a fix commit on the same lines.

Bots: a login ending in `[bot]` or a `Bot` user type. Leave their comments out, except a bot finding that repeats
across pull requests; list those separately, marked as bot.

## Slice: commit history

Start from `node <skill folder>/mine.mjs commits`. A subject is a lead, not evidence: read each diff
(`git show <sha>`) and say what was wrong before counting it. A commit that only adds new work is not a correction,
whatever its subject says.

Signals: reverts and what they reverted; fix commits that touch the same file or the same kind of line; the files
ranked at the end of the output; a fix that repeats a fix made earlier somewhere else; commits named "review fixes"
or "fixes from the dry run", whose diffs hold the corrections a reviewer asked for.

## Slice: transcripts and memory

Start from `node <skill folder>/mine.mjs transcripts <folder>` for each folder you were given, and only those. It
prints what the user typed, one row per message with its line number. Open the transcript file at a line only when
you need the context of a correction, and copy nothing out of it.

Signals: "no", "don't", "stop", "I said", "again", "why did you", "use X instead", an interrupt followed by a new
instruction, the same instruction given in more than one session. Count sessions, not messages: one session that
repeats a correction five times is one instance with a note.

If the folder holds a `memory/` folder, read its files: a saved preference or feedback note is a correction that
was worth keeping.

## Slice: instruction files

Read every instruction file you were given. For each rule, decide:
- what mistake it exists to prevent (a rule in capitals, or with "never", "always" or "do not", was written after
  that mistake happened at least once);
- whether anything enforces it: search the lint configuration, CI workflows, git hooks, Claude Code hooks
  (`.claude/settings.json`) and tests. A rule nothing enforces is a candidate for a higher layer.

Also search the code for comments that explain a workaround or warn the reader (`HACK`, `workaround`, `do not`,
`don't use`, `deprecated`, `must`): each one marks a trap an agent will walk into.
