# lazy-senior (Adapted from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail/tree/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846))

Back to the [origins index](../../ORIGINS.md).

Closest upstream, at commit `96608e0` (MIT, Copyright (c) 2026 DietrichGebert): `skills/ponytail/SKILL.md` and
`AGENTS.md` (the rules), `skills/ponytail-review/SKILL.md` and `skills/ponytail-audit/SKILL.md` (the review),
`skills/ponytail-debt/SKILL.md` (the ledger), and `hooks/ponytail-subagent.js`, `hooks/ponytail-activate.js` and
`hooks/claude-codex-hooks.json` (the hook). Shared word 6-grams, as the share of each new file's 6-word runs found in
its upstream file: `RULES.md` 15%, `BUILD.md` 7%, `REVIEW.md` 20 to 22%, `SKILL.md` 0%, the hook 0%, `EXAMPLES.md` 0%.

**Problem.** Asked for a small feature, an agent writes a layer, an option and a helper nobody asked for, adds a
dependency for a few lines, or stops at the first file and leaves callers and tests broken. Reviews run the other way:
they rank style and size before the bug that loses data. Limits the agent knowingly left in place are forgotten,
because nothing lists them.

**What generalising changed.** The upstream is a mode for the whole session with a persona, levels and commands. Here
it is one skill with four modes that applies to the change asked for, plus a hook that carries only the short
ruleset. The ruleset opens with "When you write or change code", so a reviewing or read-only agent knows it is not
addressed, and ends with "The project's instructions and the task's output format come first". The ledger is a
script instead of a grep recipe, so it can tell a comment from prose.

**What this version changes.** From `git diff --no-index` between copies of the upstream files and the new files:
`skills/ponytail/SKILL.md` against `RULES.md` 14 insertions and 52 deletions, against `BUILD.md` 84 and 52;
`skills/ponytail-review/SKILL.md` against `REVIEW.md` 74 and 78, `skills/ponytail-audit/SKILL.md` 77 and 83;
`skills/ponytail-debt/SKILL.md` against `SKILL.md` 55 and 28; `hooks/ponytail-subagent.js` against
`hooks/planning/lazy-senior.mjs` 61 and 80; `hooks/claude-codex-hooks.json` against `hooks/planning/hooks.json` 4 and
18 (first round; the fix round reworded the ruleset's last lines and BUILD.md).
- Dropped: the persona and its session-long activation, the levels lite, full and ultra, the slash commands and stop
  phrases, the codebase map, the statusline and band, the gain scoreboard, the help card, the benchmark numbers, the
  older `ponytail:` marker, and every upstream example (two of them are unsafe by upstream's own safety benchmark).
- The rules are a fixed `RULES.md`: a six-rung ladder stated as what does the job ("This codebase already does it")
  rather than as questions, plus "add no layer", a test of the edge cases for non-trivial logic and every bug fix, the
  shortcut form, the reply ending and "the project's instructions come first". `BUILD.md` explains each rule and adds
  money in minor units or a decimal type, times with their zone, never hand-rolling crypto, sanitizing, auth or
  quoted-format parsers, a regression test for every bug fix, and leaving a public interface alone unless asked.
- The review and audit skills are merged into one `REVIEW.md` with two scopes. A `shortcut:` comment is a finding when
  it cuts something `RULES.md` says never to cut, and never excuses a security, validation or data-loss finding. An
  exported API may have callers outside the repository. A new example finding replaces the billing one, and there is a
  next step to `review-triage`.
- The debt grep recipe is replaced by `debt.mjs`: only the files git lists and only regular files inside the folder (no
  symlinks, submodules, deleted paths or files reached through a symlinked folder); NUL files and files over 64 MiB
  skipped; a comment opener required (14 families, punctuation allowed before it, no letter, digit, quote or
  backtick); in Markdown, reStructuredText and AsciiDoc only HTML comments; a closer cut only after its own opener;
  `\n`, `\r\n` and a lone `\r` as line breaks; control characters escaped in the output; a comma between digits not a
  trigger; sorted by path and line, each path once; exit 2 outside a work tree.
- The hook is one Node file for SessionStart and SubagentStart with the shared config off switch. It drops the flag
  file, the agent type matcher, the mode tracker and the UserPromptSubmit hook.
- `EXAMPLES.md` is new: five fresh pairs in five languages (HTML, Go, Python, TypeScript, Rust), each run where a
  runtime was available.

**Measured before it shipped.** A blind `skill-eval` run on 2026-11-16 (`claude-haiku-5-5`, three tasks, three runs
each with and without the ruleset in the prompt, 0.10 US dollars): the runs with the ruleset scored the same or higher
on every task, by the judge and by a blind reader, and changed far less code on the bug fix (+2 lines against +9 to
+12). Two of three left out a summer-time test, which led to the ruleset's edge-case wording. Small sample, one small
model.

**Q24 (2026-11-18).** From the Claude Code team's article on verification (claude.dev blog, 2026-11-16), ideas only, no shared text. The review finds the triggered checklist entries with `review-scope.mjs` if
`review-triage` or `lean-subagent-dev` is installed, or matches them by hand against the diff from the merge base, and
reports a `Checklist:` line. BUILD.md's Tests section adds property tests for parsers, money and data writes: the four
properties and the seed rule in short, the project's own library or a small seeded loop, and a pointer to `tdd`'s
PROPERTIES.md if it is installed.

**Q33 (2026-11-25).** One ruleset line and one BUILD.md bullet: a new file needs a reason (a new responsibility, a
public interface, or a file the language or layout requires), never size alone; extend the nearest existing file
first, keep code that changes together in one place, and a split file says where its parts went. It is not a rule
against new files. The ruleset grows to 1,640 characters and the hook's context to 1,772, under caps the owner raised
to 1,650 and 1,800.
