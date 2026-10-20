# Messages, ratchets and exceptions

Names and `${CLAUDE_SKILL_DIR}` mean what SKILL.md says: `${CLAUDE_SKILL_DIR}` is this folder.

**Every message names what to use instead.** A hook reason, a lint message or a CI error says what was found and
which file, function or command to use: "use `config.load()` from `app/config`, not `os.environ` (rule
no-env-read, see CLAUDE.md)", not "forbidden call". An agent that reads only "denied" tries variations until one gets
through. Linters take the message in the rule's configuration: ESLint `no-restricted-syntax` and
`no-restricted-imports` take a `message` per entry, Ruff's `lint.flake8-tidy-imports.banned-api` a `msg`, Clippy's
`disallowed-methods` in `clippy.toml` a `reason` and a `replacement`, golangci-lint `forbidigo` a `msg` per
pattern. A grep step in CI prints the replacement itself.

**A ratchet, for a pattern that is already common.** When the live count from step 1 is too large to fix in this
change, the check counts the instances against a committed baseline and fails only when a change adds more. When
the count drops, it asks for the baseline to be lowered in the same change, so the count cannot climb back. The
baseline is a number per rule (or per file and rule), not a list of exceptions. Use the project's tool when it has
one:
- ESLint: `eslint --suppress-rule <rule>` (or `--suppress-all`) writes the current counts per file and rule to
  `eslint-suppressions.json` (moved with `--suppressions-location`); later runs fail when a file goes over its
  count, and fail when a count drops until `--prune-suppressions` lowers it. `--max-warnings <n>` is a cruder ratchet
  on the warning total.
- Ruff: `ruff check --add-noqa="<reason>"` writes a `noqa` comment with the reason on every current violation, so
  only new lines fail. It records each line, not a count; the `RUF100` rule reports `noqa` comments that no longer
  match anything.
- golangci-lint: `--new-from-merge-base <branch>`, `--new-from-rev <rev>` or `--new-from-patch <file>` report only
  issues in code the change touched. This is a diff ratchet, not a count: an old instance moved into a touched line
  reappears.
- Anything else, in any language: `${CLAUDE_SKILL_DIR}/templates/ratchet.mjs` counts the lines matching a regular
  expression in the files chosen by git globs and compares the count with a baseline file. It needs Node.js 20 or
  later wherever it runs, locally and in CI, whatever the project's language. Copy it into the project (for example
  `scripts/ratchet.mjs`), run it once with `--update` to write the baseline, commit both, then run the same command
  locally and in CI. Its usage is at the top of the file, and its error names the replacement you pass with
  `--instead`. `--files` and `--baseline` are relative to the repository root, whatever folder it runs from. Each
  `--files` value is a git glob, quoted so the shell does not expand it: `*.py` matches top-level files only,
  `**/*.py` matches every folder. A value that starts with `:(` goes to git unchanged, so
  `:(exclude)app/config.py` leaves out the one file that is allowed to do it. Globs that match no file are an
  error, not a baseline of 0.

Prefer a linter rule that parses the code when one exists (Ruff `banned-api`, TID251; ESLint `no-restricted-imports`
or `no-restricted-syntax`; Clippy `disallowed-methods`; golangci-lint `forbidigo`). A regular expression counts the
pattern inside strings, comments and docstrings, and misses aliases such as `import os as o` or
`from os import environ`. Use `ratchet.mjs` for plain text patterns, or as the count over a linter that has no
baseline of its own: silence today's instances with the linter's suppression comment and point `ratchet.mjs` at that
comment (for example `--pattern 'allow\(clippy::disallowed_methods\)'`), so the linter catches every new instance,
aliases included, and the number of suppressions can only fall.

Two changes merged one after the other that each lower the baseline can leave the main branch red, because the
second still holds the first one's number; the fix is one more `--update`. ESLint's suppressions file behaves the
same way. When the project has no CI, add the check to the command it already runs (its test or lint script), and
tell the user that nothing enforces the rule on merge.

**Exceptions go on the offending line**, with a reason, an expiry date and who approved it:
`<comment marker> <check id>: allowed until <date>, <reason>, approved by <role or handle>`, for example
`# no-env-read: allowed until 2026-12-31, read before the config loader exists, approved by @org/platform-owners`.
Record the approver the way the project records approvals (a code owner team, a reviewer handle), never a person's
name. An agent may propose an exception; a human approves it. A script cannot tell who wrote "approved by", so code
review is the human gate: a CODEOWNERS entry on the files, or a reviewer who checks each new exception line.
`ratchet.mjs` lists every valid exception (file and line, expiry, approver) on each run so the reviewer sees them, and
fails on an expired or incomplete one. An exception on a counted line takes it out of the count, so the baseline is
lowered in the same change. When the tool has its own suppression comment, put the same fields in the text it allows
after the codes, on the same line (`# noqa: T201 <fields>`, `// eslint-disable-line <rule> -- <fields>`), and add a
small CI step that fails on an expired date.
