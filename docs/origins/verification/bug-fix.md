# bug-fix (Adapted from [pstack bug-fix playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/bug-fix.md) and [mattpocock/skills diagnosing-bugs](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/engineering/diagnosing-bugs))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/poteto-mode/playbooks/bug-fix.md`, with `skills/principle-attack-the-premise/SKILL.md`,
`skills/principle-fix-root-causes/SKILL.md`, `skills/principle-prove-it-works/SKILL.md`, `skills/blast-radius/SKILL.md`
and `automations/benny/skills/reproduce-and-fix-issues/references/verify-existing-fix.md`. About 5% of my `SKILL.md`
word 6-grams (136 of 2,775) appear in those files, mostly from fix-root-causes, blast-radius and attack-the-premise.
`EVIDENCE.md` shares none.

**Problem.** Agents fixing a bug tend to add a guard where it crashed, keep "might help" changes, try a third fix on
the same wrong belief, and call it fixed from a unit test or from one run.

**What this version changes.**
- The playbook's six steps become nine and take in the principle skills it links to: the legitimacy test for guards
  (a guard is a fix only when the state it guards is legitimate), attack the premise after two failed fixes that rest
  on it, suspect the observation method, and a blast-radius step that names the one fact the change is safe because
  of, with a five-rung proof ladder.
- From verify-existing-fix: reproduce twice from a clean state, "no baseline, no claim", and a section for verifying
  a fix that already exists, with versions checked out in separate worktrees, never over the user's changes.
- Added: a search for an existing fix in step 1; work on a branch; a hypothesis log whose rows count only with pasted
  output, with predictions if true and if false; reverting every change a refuted hypothesis motivated; the failing
  repro committed before the fix and the fix committed before the proof; paths back when a fix or its safety check
  fails; the verdict "reproduced, not fixed"; a report template.
- Removed: Cursor's control skill and `/loop`, model and speed choices, the other pstack skills it called, and the
  instruction to delegate the investigation. An independent check goes to `evaluator` if it is installed, or to a
  fresh subagent.
- New `EVIDENCE.md`, language-neutral: driving and resetting each surface, runtime evidence per language,
  `git bisect run`, checks on the observation itself, and expected-failure markers with how to pin the reason a test
  fails (pytest `raises=`, Rust `should_panic(expected = ...)`).

**Why.** The playbook depends on Cursor and on other pstack skills for its key rules. A Claude Code agent needs them
in one place, for any language and surface. Tried on a planted off-by-one whose obvious fix is a guard: the
legitimacy question led to the producer, not the guard.

**Q24 (2026-11-18).** From the Claude Code team's article on verification (claude.dev blog, 2026-11-16), ideas only, no shared text. `EVIDENCE.md` gains a differential check for a rewrite: when the smallest
justified fix still rewrites a function, old (in a worktree outside the repository) and new run on the same seeded
inputs, the bug's trigger is written as a condition, and every difference outside it is a blast-radius finding for step
8 item 4.

**Q30 (2026-11-24).** From mattpocock/skills `skills/engineering/diagnosing-bugs/SKILL.md` at abeeaf9 (MIT), in my own
words. `EVIDENCE.md` gains "Building the automated check": nine ways to build a check that goes red on the bug, in
about the order to try them (a failing test, an HTTP script, a CLI command diffed against a known-good copy, a headless
browser script, a replayed capture, a throwaway harness, a seeded property or fuzz loop, a `git bisect run` harness, a
differential loop), and how to make it faster, sharper and deterministic. Step 2 minimises the repro one element at a
time before step 3; it is minimal when removing any one element makes the discriminating observation go away. Not
taken: the human-in-the-loop script (its template is not here), Redact, ranked hypotheses shown to the user, the
performance branch and the glossary read. 2 of 125 new word 6-grams in `SKILL.md` and 0 of 367 in `EVIDENCE.md`
appear upstream.
