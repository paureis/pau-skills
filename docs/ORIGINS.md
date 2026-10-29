# Origins

Where each piece came from, the problem that led to it, and, for the adapted ones, exactly what changed relative to
upstream. Most of these I wrote for my own projects first, and their stories are from those projects with the names
removed. Pieces whose "Changes for this release" says "written for this release" are new: they address failure modes
that are common in agent work, and their problem statements describe the failure in general terms rather than a
specific incident.

## How provenance was decided

Every skill was compared against the full git history of [mattpocock/skills](https://github.com/mattpocock/skills)
(493 commits, from 2026-02-03 to the 2026-09-29 head), not just its current version, because the upstream skills have
been renamed and rewritten since I copied them. For each of my files I found the closest upstream version by two
measures: shared normalized lines (LCS) and the share of my word 6-grams that appear in any upstream version of any
file. The change lists below come from `git diff --no-index` between my file and that closest version.

- **Original**: no meaningful shared text with any upstream version (under 1% of 6-grams).
- **Adapted**: shared structure or text, plus substantive changes of mine.
- **Abridged copy**: upstream text shortened, with no substantive additions. Treated like an unchanged copy: not
  published here, linked in the README instead.

After that comparison, every skill (adapted ones included) went through a punctuation pass that replaced em and en
dashes with commas, colons, periods or parentheses. It changed no instructions, so the classifications and change
lists below still hold.

The skills adapted from [pstack](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack)
(`arena`, `architect`, `bug-fix`, `verify-app`, and the later ones named in their sections) were compared the same way, file by file, against that commit of
Cursor's plugin repository. pstack is a single snapshot, so there is no history to search.

---

## session-discipline

- [retrospective](origins/session-discipline/retrospective.md): Original
- [session-close](origins/session-discipline/session-close.md): Original
- [handoff](origins/session-discipline/handoff.md): Original
- [Roadmap hook, `hooks/session-discipline/roadmap.mjs`](origins/session-discipline/roadmap.md): Original
- [instructions-audit and `scan.mjs`](origins/session-discipline/instructions-audit.md): Original
- [which-skill](origins/session-discipline/which-skill.md): Original
- [Branch-context hook, `hooks/session-discipline/branch-context.mjs`](origins/session-discipline/branch-context.md): Original
- [Compact-snapshot hook, `hooks/session-discipline/compact-snapshot.mjs`](origins/session-discipline/compact-snapshot.md): Original
- [Skill-usage hook, `hooks/session-discipline/skill-usage.mjs`](origins/session-discipline/skill-usage.md): Original
- [project-setup](origins/session-discipline/project-setup.md): Original

---

## verification

- [mutation-test and `skills/verification/mutation-test/mutate.sh`](origins/verification/mutation-test.md): Original
- [evaluator](origins/verification/evaluator.md): Original
- [tdd](origins/verification/tdd.md): Adapted from [mattpocock/skills `tdd`](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd) and [pstack](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/principle-test-behavior-not-implementation/SKILL.md)
- [ci-cost-and-cadence and `measure-minutes.mjs`](origins/verification/ci-cost-and-cadence.md): Original
- [flaky-test-hunt and `repeat.mjs`](origins/verification/flaky-test-hunt.md): Original
- [migration-review](origins/verification/migration-review.md): Original
- [Test-tamper guard, `hooks/verification/test-tamper-guard.mjs`](origins/verification/test-tamper-guard.md): Original
- [Suppression-reason hook, `hooks/verification/suppression-reason.mjs`](origins/verification/suppression-reason.md): Original
- [Verify-before-done hook, `hooks/verification/verify-before-done.mjs`](origins/verification/verify-before-done.md): Original
- [review-triage and `review-scope.mjs`](origins/verification/review-triage.md): Original; learned patterns and two triage rules adapted from [pstack `bugbot-triage.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/references/bugbot-triage.md)
- [bug-fix](origins/verification/bug-fix.md): Adapted from [pstack bug-fix playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/bug-fix.md)
- [verify-app and `check-map.mjs`](origins/verification/verify-app.md): Adapted from [pstack `create-verification-skill`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/create-verification-skill)
- [hillclimb and `decisions.mjs`](origins/verification/hillclimb.md): Adapted from [pstack hillclimb playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/hillclimb.md)
- [skill-eval and `skill-eval.mjs`](origins/verification/skill-eval.md): Adapted from [pstack eval playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/eval.md)
- [launch-readiness, `ledger.mjs`, `table.mjs` and `rules.mjs`](origins/verification/launch-readiness.md): Original

---

## agent-orchestration

- [No-idle hook, `hooks/agent-orchestration/no-idle.mjs`](origins/agent-orchestration/no-idle.md): Original
- [methodology](origins/agent-orchestration/methodology.md): Original
- [codebase-oracle](origins/agent-orchestration/codebase-oracle.md): Adapted from [pstack `how`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/how) and [`why`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/why)
- [parallel-worktrees and `worktrees.mjs`](origins/agent-orchestration/parallel-worktrees.md): Original
- [lean-subagent-dev](origins/agent-orchestration/lean-subagent-dev.md): Original; `TRIAGE.md` adapted, ideas from [pstack poteto-mode](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode)
- [arena and `arena.mjs`](origins/agent-orchestration/arena.md): Adapted from [pstack `arena`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/arena)
- [overnight-run and `log.mjs`](origins/agent-orchestration/overnight-run.md): Adapted from pstack [`docs/guide/07-overnight.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/docs/guide/07-overnight.md), `skills/poteto-mode/playbooks/autonomous-run.md`, `playbooks/pause-safely.md` and `skills/show-me-your-work`
- [geppetto, `check-agents.mjs` and the starter roster](origins/agent-orchestration/geppetto.md): Original

---

## guards

- [Inline-backtick guard, `hooks/guards/block-inline-backtick-payload.mjs`](origins/guards/inline-backtick-guard.md): Original
- [Merge guard and safe merge, `hooks/guards/merge-guard.mjs`, `skills/guards/safe-merge/safe-merge.mjs`](origins/guards/safe-merge.md): Original
- [dependency-security-audit](origins/guards/dependency-security-audit.md): Original
- [rule-to-hook](origins/guards/rule-to-hook.md): Original; since 2026-10-17 adapted in part from [pstack `correct`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct)
- [dependency-upgrade](origins/guards/dependency-upgrade.md): Original
- [Secret guard, `hooks/guards/secret-guard.mjs`](origins/guards/secret-guard.md): Original
- [File-size guard, `hooks/guards/file-size-guard.mjs`](origins/guards/file-size-guard.md): Original
- [Destructive guard, `hooks/guards/destructive-guard.mjs` and `hooks/lib/shell.mjs`](origins/guards/destructive-guard.md): Original
- [No-verify guard, `hooks/guards/no-verify-guard.mjs`](origins/guards/no-verify-guard.md): Original

---

## planning

All four are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, see `NOTICE`). Each
`SKILL.md` carries a `license` line and an `upstream` link in its frontmatter.

- [grill-me](origins/planning/grill-me.md): Adapted from [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me)
- [to-prd](origins/planning/to-prd.md): Adapted from [`to-prd`](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-spec), now `to-spec` upstream
- [to-issues](origins/planning/to-issues.md): Adapted from [`to-issues`](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-tickets), now `to-tickets` upstream
- [improve-codebase-architecture](origins/planning/improve-codebase-architecture.md): Adapted from [`improve-codebase-architecture`](https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture) and pstack [`design-red-flags.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/architect/references/design-red-flags.md), `architect/SKILL.md`, `principle-minimize-reader-load`, `principle-model-the-domain` and `poteto-mode/playbooks/refactoring.md`
- [architect](origins/planning/architect.md): Adapted from [pstack `architect`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/architect)
- [brainstorm](origins/planning/brainstorm.md): Original
- [sharpen](origins/planning/sharpen.md): Adapted from [pstack `sharpen`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/sharpen)
- [agent-friendly-audit and `mine.mjs`](origins/planning/agent-friendly-audit.md): Adapted from [pstack `correct`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct)
- [engineering-principles](origins/planning/engineering-principles.md): Adapted from pstack [`poteto-mode`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode) "Principles", the `principle-*` skills and `docs/guide/08-principles.md`

---

## Not published

| Skill | Finding from the diff | Where it is listed |
|---|---|---|
| grill-with-docs | Abridged copy of upstream `grill-with-docs` (2026-04-28 to 2026-04-30; 73% of 6-grams shared). The changes are removals (example trees, the CONTEXT-FORMAT and ADR-FORMAT references) plus trigger phrases and one paragraph relating it to grill-me. | README, "I also use, unmodified" |
| prototype | Abridged copy of upstream `prototype` (2026-05-06 to 2026-07-10; 84 to 86% of 6-grams in `SKILL.md` and `LOGIC.md`). The changes condense upstream text; the only addition named an issue tracker. | README, "I also use, unmodified" |
| bro | No shared text with upstream `wait-what` (0 of 264 6-grams), but it carries a `license: MIT` line and a Portuguese-language rule that suggest another source I have not found. Left out until its origin is known. | Not listed |
