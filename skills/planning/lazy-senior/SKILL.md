---
name: lazy-senior
description: "Writes the smallest complete change: asks if it needs to exist, then reuses the codebase, standard library or an installed dependency. Reviews a diff or repo for bugs first, bloat last, and lists shortcut comments. Use when the user says 'write the simplest version', 'this is over-engineered', 'review for bloat' or 'what can I delete'."
argument-hint: "[build, review, audit or debt, and the task, diff or folder]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from DietrichGebert/ponytail; see NOTICE)
metadata:
  upstream: https://github.com/DietrichGebert/ponytail/tree/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846
---

# Lazy senior

Asked for: $ARGUMENTS

Solve the whole problem with the least new code, and review code the same way: bugs first, bloat last. Pick the mode
from the request. A request to write, fix or refactor code is build; a request about code that exists is review (a
change) or audit (a folder or the whole repository); a request for the list of known limits is debt.

| Mode | When | Read |
|---|---|---|
| Build | the user asks for code: a feature, a fix, a refactor, "the simplest version" | `${CLAUDE_SKILL_DIR}/RULES.md`, then `${CLAUDE_SKILL_DIR}/BUILD.md` |
| Review | a diff, a branch, a pull request or named files; "is this over-engineered" | `${CLAUDE_SKILL_DIR}/REVIEW.md` |
| Audit | a folder or the whole repository; "what can I delete", "review for bloat" | `${CLAUDE_SKILL_DIR}/REVIEW.md` |
| Debt | the user wants the list of `shortcut:` comments, the known limits left in the code | `${CLAUDE_SKILL_DIR}/debt.mjs` |

## Build

Read `${CLAUDE_SKILL_DIR}/RULES.md`, then `${CLAUDE_SKILL_DIR}/BUILD.md`, which explains each rule. They apply to the
change the user asked for, not to the rest of the session: when that change is done, work as before. Worked
before-and-after pairs are in `${CLAUDE_SKILL_DIR}/EXAMPLES.md`.

## Review and audit

Read `${CLAUDE_SKILL_DIR}/REVIEW.md`. A review covers a change: the diff, a branch, a pull request or the files the
user names; with nothing named, the uncommitted changes, or the last commit when there are none. An audit covers a
folder or the whole repository; with nothing named, the whole repository. Both write a report and change no code.

## Debt

1. Run `node "${CLAUDE_SKILL_DIR}/debt.mjs" [folder]` (Node 20 or later; the folder defaults to the current one). It
   reads the files git lists, tracked and untracked but not ignored, and prints one row per marker, then a count.
   Without Node, run `git grep -n "shortcut:"` and keep only the hits that sit in a comment.
2. Read the rows, the ones tagged `[no-trigger]` first: they name a limit but no point at which to revisit it, so
   nobody ever will. For each, say what the limit is and propose a trigger, or say that the limit no longer holds.
3. Write a ledger file only when the user asks for one.

The marker form is `shortcut: <the limit>, <when to upgrade>`, in the language's own comment syntax: `# shortcut:` in
Python, Ruby or shell, `// shortcut:` in Go, Rust, Java or TypeScript, `-- shortcut:` in SQL or Lua, and
`<!-- shortcut: ... -->` in HTML or Markdown. The script counts a marker only right after a comment opener, so prose
and inline code that mention the convention stay out. Known limit: a string that holds a space and then an opener,
such as `'a -- shortcut: b'`, is counted.

For another marker word, such as TODO or HACK, search by hand with the project's search tool (`git grep -n`, or
`rg -n`, which skips ignored files), and leave out what git ignores.

## The hook

If the pau-skills hooks are installed, the `lazy-senior` hook adds the text of `RULES.md` to every session and every
subagent, so the build rules apply without starting this skill. Turn it off with `"hooks": {"lazy-senior": false}` in
`.claude/pau-skills.json`. The skill works the same without the hook.

## Other skills

- Use `engineering-principles` if it is installed, for its principle "Subtract before you add" when the change starts
  in a tangled area; without it, `BUILD.md` covers the part this skill needs.
- Use `tdd` if it is installed for the test step of a build; without it, write the one small test `BUILD.md` asks for
  first, watch it fail, then write the code.
- After a review or an audit, offer to run `review-triage` if it is installed, to decide which findings to fix;
  without it, the user picks by number.
- When a finding needs a deeper refactor than one change, offer to run `improve-codebase-architecture` if it is
  installed; without it, list the finding as its own piece of work.
