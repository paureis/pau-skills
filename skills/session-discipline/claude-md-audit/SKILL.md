---
name: claude-md-audit
description: Audit the instruction files a coding agent reads (CLAUDE.md at every level, CLAUDE.local.md, imported files, .claude/rules, AGENTS.md, .cursorrules, Copilot instructions and similar) for token cost, duplicated and contradictory rules, stale paths and commands, vague rules, secrets, and missing essentials, then produce a ranked report with concrete proposed edits and apply only the ones the user approves. Use when the user says "audit my CLAUDE.md", "clean up CLAUDE.md", "my CLAUDE.md is too long", "the agent keeps ignoring my rules", "review our AGENTS.md", "are my instructions stale", "trim the rules file", or before handing a repository's agent setup to a team.
argument-hint: "[project root, default: current directory]"
---

# CLAUDE.md audit

Every line in an always-loaded instruction file is paid for in every session, and a rule the agent cannot follow,
or that contradicts another rule, costs more than it saves. This skill measures those files, finds what is wrong
with them, and proposes edits. It proposes deletions as readily as additions: a shorter file that the agent actually
follows is the goal.

Scope from the user: $ARGUMENTS

Bundled files:
- `${CLAUDE_SKILL_DIR}/scan.mjs`: finds the files, measures them, and runs the mechanical
  checks (duplicates, unresolved references, secrets, vague wording, emphasis). Node 20+, no dependencies.
- `${CLAUDE_SKILL_DIR}/CHECKS.md`: the judgment checklist, which files each tool reads, and
  the report template ([CHECKS.md](CHECKS.md)). Open it at Phase 2.

## Rules for the whole run

- **Never write to an instruction file without showing the exact diff first and getting an explicit yes.** Approval
  of the report is not approval of an edit. "Looks good" on a list of findings means the findings are agreed, not
  that you may start editing.
- **Never print a secret.** The scan masks previews; keep them masked in the report and in chat. If a secret is
  found, tell the user to rotate it: deleting the line does not remove it from git history.
- **Do not edit files outside the repository** (the user-level `~/.claude/CLAUDE.md`, a parent directory's file)
  unless the user names that file in their approval. Those files affect every project on the machine.
- **Do not add a rule to fix a rule.** If a rule is broken repeatedly, the fix is a hook or a test, not a louder
  restatement.
- **Do not "improve" wording you were not asked about.** Every edit you propose must trace back to a finding.

## Phase 1: Scan

From the project root (or the path in the arguments):

```bash
node "${CLAUDE_SKILL_DIR}/scan.mjs" <root>
node "${CLAUDE_SKILL_DIR}/scan.mjs" <root> --json > <scratch>/scan.json
```

Useful options: `--threshold 0.5` to see looser near-duplicates (default 0.6), `--global-refs` to also check paths
cited in the user-level file, `--max-depth N` for deep monorepos, `--no-ancestors` to ignore parent directories.

What it reports, and what each number means:
- **Files** with bytes, lines, estimated tokens (about four characters per token) and when each one loads:
  `every-session` (paid in every conversation), `in-subtree` (nested files, loaded when work touches that folder),
  `conditional` (rules files scoped by `paths:`), `other-tool` (read by a different agent, unless imported).
- **Largest sections** by heading: where the always-loaded cost is concentrated.
- **Near-duplicate pairs**: rule units (bullets, paragraphs, table rows) whose content-word bigrams overlap above the
  threshold, within and across files. `exact` means the same words after normalising.
- **Unresolved references**: backticked or path-like paths, `@imports`, and `npm`/`pnpm`/`yarn`/`bun run`, `make` and
  `just` targets that do not exist. Bare file names resolve if that name exists anywhere in the tree.
- **Possible secrets or personal data**, masked.
- **Vague-rule candidates**: rules that use phrases like "clean code" or "when appropriate" and name nothing checkable.
- **Emphasised rules**: capitals, "NEVER", "again". Often a sign that the rule has been broken before.

The scan is a list of candidates, not verdicts. Read each hit in context before it goes into the report. A
near-duplicate may be a deliberate summary; an unresolved path may be a file that is generated at build time.

Done when: the scan has run, and you have read every file it lists in full (not only the flagged lines). If it
lists no files, say so and offer to draft a minimal file from the "missing essentials" list in `CHECKS.md` instead.

## Phase 2: Judge what the scan cannot

Open `CHECKS.md` and work through its checklist for every file. The scan cannot do these; they need reading:

- [ ] **Contradictions**: two rules that cannot both be followed ("use pnpm" and "run `npm install`"; "never commit
      without asking" and "commit after each step"), including between the user-level and project files, and between
      CLAUDE.md and AGENTS.md or Cursor rules in the same repository.
- [ ] **Stale facts the scan missed**: commands for tools the project no longer uses, outdated versions, folders
      that were renamed. Detect the project's real tooling from its manifests and lockfiles before judging (see
      `CHECKS.md`), and verify any command you doubt by reading its definition, not by running something destructive.
- [ ] **Relevance**: content loaded every session that matters only for one area or one rare task. Candidates to
      move into a nested `CLAUDE.md`, a path-scoped rules file, a skill, or a doc that is linked rather than imported.
- [ ] **Obvious rules**: rules that restate what the code, the linter config or the formatter already enforces, or
      what any competent agent does by default.
- [ ] **Rules that keep being broken**: check `git log -p` on the instruction files for rules that were reworded or
      repeated, and ask the user which rules the agent ignores. Each becomes a hook candidate: name the event, what it
      matches and what it blocks. If the `rule-to-hook` skill is installed, point to it to build the hook.
- [ ] **Missing essentials**: how to install, build, test (all and a single test), lint and format; where the main
      code, tests and config live; anything an agent must never touch. Check that each answer is true now.
- [ ] **Imports and layering**: an imported file that is huge or mostly irrelevant; a local file
      (`CLAUDE.local.md`) that is not gitignored; personal preferences sitting in the shared project file.

Done when: every checklist item has either findings or an explicit "nothing found" for each file.

## Phase 3: Write the report

Use the template in `CHECKS.md`. Order findings by severity, then by token cost:

1. **Critical**: secrets or personal data in a tracked file; contradictions on safety or destructive actions.
2. **High**: other contradictions; stale commands or paths the agent would act on; broken `@imports`.
3. **Medium**: duplicates; rules that keep being broken (hook candidates); missing essentials; large blocks loaded
   every session that are rarely relevant.
4. **Low**: vague rules; obvious rules; wording.

Every finding carries: the file and line, the evidence (quote the line, cite the scan or the missing file), the
proposed edit as a unified diff or an exact "replace X with Y" / "delete lines N to M", and its token effect.
Sum the token effect at the top: "always-loaded cost goes from ~N to ~M tokens if everything is accepted."

Prefer, in this order: delete, merge, move out of the always-loaded set, make specific, add. When you propose an
addition (a missing test command, say), show the exact line and where it goes, and say what you verified it against.

Done when: the report is written, every finding has a concrete edit or an explicit "no edit, needs a decision from
you", and nothing has been changed on disk.

## Phase 4: Apply approved edits only

1. Ask which findings to apply. Accept numbers, ranges, "all critical and high", or "none".
2. For each approved finding, show the final diff for that file, then apply it with the editor tool. Group edits by
   file so the user sees one diff per file.
3. After editing, re-run the scan and show the before and after token totals and finding counts. Read each edited
   file back around the change; a scripted edit that silently matched nothing is the common failure here.
4. List what was left unapplied, so it is not lost.

Done when: only approved edits are on disk, the re-scan output is shown, and nothing was committed unless the user
asked for a commit.

## Final report format

```
CLAUDE.md audit: <root>
Files: <n> (<every-session tokens> tokens every session, <other> conditional or other tools)
Findings: <critical> critical, <high> high, <medium> medium, <low> low
Applied: <ids>   Declined or pending: <ids>
Always-loaded tokens: <before> -> <after>
Hook candidates: <ids or none>
Follow-ups for the user: <rotate a secret, decide a contradiction, ...>
```

## When not to use this

- The user wants a new CLAUDE.md for a project that has none: write it from the essentials list, then run this
  skill on the result later, once there is history to judge it against.
- The user wants to record a lesson from the current session: this skill audits the whole store, not one new entry.
  The `retrospective` skill guards each new entry with its own redundancy gate, if it is installed; otherwise check
  the new line against the near-duplicate pairs this scan reports before adding it.
