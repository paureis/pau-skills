# engineering-principles (Adapted from pstack [`poteto-mode`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode) "Principles", the `principle-*` skills and `docs/guide/08-principles.md`)

Back to the [origins index](../../ORIGINS.md).

Closest upstream, at 09d06eb: `skills/poteto-mode/SKILL.md` (the Principles index and the citation rule in
Non-negotiables), `docs/guide/08-principles.md` (steering with names), and `skills/principle-{build-the-lever,
explain-the-number, make-operations-idempotent, type-system-discipline, boundary-discipline, model-the-domain,
minimize-reader-load, separate-before-serializing-shared-state, subtract-before-you-add, laziness-protocol,
migrate-callers-then-delete-legacy-apis, redesign-from-first-principles, experience-first}/SKILL.md`. Also three rules
from `skills/typescript-best-practices/SKILL.md`, one phrase from `skills/poteto-mode/playbooks/refactoring.md`, and the
two-line debugging fallback from `principle-fix-root-causes` and `principle-attack-the-premise`. Text upstream cut as
unneeded is restored only where a kept principle needs it: from e5136d8 (parent of 99743e9, pull request 634) for
type-system-discipline and migrate-callers-then-delete-legacy-apis; from ea32d95 (parent of 08bd59b, pull request 571)
for laziness-protocol; from d73344b (before 00b14f1) for the per-language idioms of type-system-discipline and the "why"
of subtract-before-you-add. Shared word 6-grams (the share of each file's distinct 6-grams, lowercased with punctuation
removed, that occur in any file of pstack at 09d06eb or in the restored texts from e5136d8, ea32d95 and d73344b):
`PRINCIPLES.md` 13.8%, `SKILL.md` 4.6% (the index structure; prose new).

**Problem.** Twenty-four principle skills cost a listing entry each and are hard to steer with. One index the user can
name from, plus a rule that a citation names the decision it changed, keeps the vocabulary without the cost and without
name dropping.

**What this version changes.**
- One skill instead of 24 principle skills: an index in `SKILL.md` (when it applies, the rule, the sign you skipped it)
  and one section per principle in `PRINCIPLES.md` under the same name. A test keeps the names and order in step.
- Eleven principles kept. Skipped: encode lessons in structure (this repository does it), exhaust the design space (in
  `arena`), guard the context window, never block on the human and outcome-oriented execution (they contradict
  `grill-me` and `migration-review`), foundational thinking, and prove it works, sequence verifiable units and test
  behavior not implementation (in `tdd`, `bug-fix` and `evaluator`). Attack the premise and fix root causes are one line
  that offers `bug-fix`, with a fallback.
- The citation rule applies per citation. The standing "in your reply, name each principle" of poteto-mode is dropped.
- Links to other pstack skills become our skills "if it is installed" (benchmark-checklist becomes `hillclimb`'s
  checklist, plus `skill-eval` for eval numbers), each with enough inline to work alone.
- Build the lever: "commit the lever" becomes "the lever belongs in the change". A delegate skill becomes a file the
  delegates read. Syntax-aware edit tools are listed per ecosystem.
- Make operations idempotent: worked examples (a lock that records its process id, convergent forms) and a pointer to
  `migration-review`.
- Type system discipline: the "make illegal states unrepresentable" and "don't lie to the type system" text cut at
  99743e9 is restored. TypeScript-only wording becomes idioms from several languages. boundary-discipline is folded in,
  with "boundary" replaced by "the seam where outside data enters". Three rules come from `typescript-best-practices`
  (simplest total type, schemas before guards, a type guard checks what its name says), each with a dynamic-language
  form.
- Subtract before you add absorbs the laziness protocol, and says how it meets redesign: "the smallest change that
  reaches the target shape".
- Migrate callers then delete: the rule cut at 99743e9 is restored. It adds the callers one change cannot reach (a
  published library, names stored in data, jobs queued by name, rolling deploys) and offers `migration-review`. Deleting
  tests that pin old internals goes through the two-edit check of `tdd` if it is installed.
- Separate before serializing shared state keeps `parallel-worktrees`'s split: an owner per file is fine; other shared
  state is separated or locked.
- Redesign from first principles works within recorded decisions (ADRs) and delivers in steps.
- Experience first: "delight" becomes the experience of whoever consumes the work, and "throwaway HTML" becomes a
  throwaway prototype.

**Review and cold run.** A fresh reviewer found idempotency examples that do not hold (a lock that records only a
process id, `CREATE TABLE IF NOT EXISTS` as convergent, a temporary file in another folder), a step that set a rule
for the rest of the session, and a lever and a subtraction with no scope; all fixed. A cold run of 14 headless
sessions holding every skill here found no collisions with `architect`, `improve-codebase-architecture` or
`brainstorm`, and the skill started on a named principle but not on its own for a design question.
