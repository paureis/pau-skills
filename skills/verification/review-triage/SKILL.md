---
name: review-triage
description: "Decide which review findings are worth fixing and stop the review and fix loop. Each finding must name a failure; it lands in must fix, fix if cheap, or leave, and every fix gets a test that fails without it. Use when the user pastes review findings or says 'triage these review comments', 'is this worth fixing', 'the review keeps finding things', 'what blocks the merge'."
argument-hint: "[the findings: a pull request, a review file, or pasted comments]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/references/bugbot-triage.md
---

# Review triage

Decide which findings from a review to act on, fix those with a test each, and stop after one fix round.

The findings: $ARGUMENTS

The method is in `${CLAUDE_SKILL_DIR}/TRIAGE.md`. Read it before triaging anything; the steps below refer to its
sections. `${CLAUDE_SKILL_DIR}/review-scope.mjs` (Node 20+, no dependencies, read only) prints the project's rules,
the files a change touches, and the flags for a fix round.

## Steps

1. **Load the project's rules.**
   `node "${CLAUDE_SKILL_DIR}/review-scope.mjs" config`
   It prints the must-fix list (the defaults plus the project's own), the risky paths and the checks. Without
   `.claude/review-rules.json` the defaults apply. If the project has an obvious core where a small mistake is
   expensive (money, credentials, deletion, the code that decides what runs where) and no file names it, offer to
   write one: show it, and write it only on a yes. If the project keeps learned review patterns (section 9 of
   `TRIAGE.md`, for example in `.claude/review-patterns.md`), read them too.

2. **Scope the change.**
   `node "${CLAUDE_SKILL_DIR}/review-scope.mjs" change --base <base branch>`
   It lists every file the change touches, which of them are risky, and whether any test changed. When the work is
   committed on the base branch itself, pass the commit it started from as `--base`.

3. **Collect the findings.** From the arguments, the pull request's review comments, or a review file. If there are
   none and the user wants a review, run one first, and give the reviewer the prompt at the end of `TRIAGE.md`.

4. **Triage every finding** with sections 1 to 4 of `TRIAGE.md`: name the failure, check the claim, rate it, pick the
   bucket. Then write the table from section 5, and decide whether nitpick gravity (section 4) applies to the whole
   review. Show the table to the user before fixing anything when a finding is a must-fix you could not reproduce, a
   security finding you could not settle, or a call that is the maintainer's. When a kind of finding keeps coming
   back, propose a learned pattern (section 9): you may add a candidate, but ask before creating the patterns file; a
   move to recurring or strong waits for a yes.

5. **Fix round**, section 6: commit the reviewed state, write a failing test for each fix first, fix, then run
   `node "${CLAUDE_SKILL_DIR}/review-scope.mjs" fix --since <reviewed commit>` (add `--base <start commit>` when the
   work is on the base branch itself) and answer every flag.

6. **Second look on the fix only**, with the `git diff` command the script prints and any new files it lists. Then
   stop, by section 7.

## Configuration

Optional `.claude/review-rules.json` in the repository. Every key is optional:

```json
{
  "mustFix": ["a command runs against the wrong account", "a test touches a real external service"],
  "riskyPaths": ["src/core/decide/**", "migrations/"],
  "checks": ["make test", "make lint"],
  "testPaths": ["checks/**"],
  "docPaths": ["handbook/**"]
}
```

`mustFix` is added to the defaults. `testPaths` and `docPaths` replace the defaults, which cover the common layouts
of most ecosystems (run `config` to see them). Paths are globs relative to the repository root. An unknown key is an
error, so a typo cannot switch a rule off without anyone noticing.

## Report

```
Review triage: <change or pull request>
Findings: <n> (must fix <a>, fix if cheap <b>, leave <c>)
<the table from TRIAGE.md section 5>
Nitpick gravity: <applied: every finding was a preference or a low-value nit, the change is probably fine | not applied>
Learned patterns: <used: names | added as candidate: names | waiting on a yes: names | none>
Fix round: <commits>; fix check flags: <none | each flag and how it was answered>
Second look: <clean | what it found, and where it went: maintainer or issue>
Issues to open: <list, or none>
Waiting on the maintainer: <list, or none>
```

## Do not

- Do not fix a finding that names no failure.
- Do not start a second fix round. What the second look finds goes to the maintainer or to an issue.
- Do not fix something outside the change in this change. Open an issue.
- Do not let a risky fix in for a minor problem because it is small.
- Do not drop a security finding you could not settle. Ask.
- Do not let a learned pattern or nitpick gravity skip checking a finding, a must-fix, or a security finding.
- Do not re-review the whole change after the fix round. Look at the fix.
