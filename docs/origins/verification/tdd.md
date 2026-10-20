# tdd (Adapted from [mattpocock/skills `tdd`](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd) and [pstack](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/principle-test-behavior-not-implementation/SKILL.md))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/engineering/tdd`, versions from 2026-02-04 to 2026-04-28. Before the pstack changes, about
16% of my `SKILL.md` 6-grams were upstream text; with the added text that is now about 9% (scaled, not recomputed).
`tests.md` is about 70% upstream; `mocking.md` shares none. pstack: `skills/principle-test-behavior-not-implementation/SKILL.md`
and `skills/tdd/SKILL.md`, with one idea from `skills/principle-sequence-verifiable-units/SKILL.md`. 57 of my 1,694
word 6-grams (3.4%) appear in those files: 48 from principle-test-behavior-not-implementation, 9 from tdd.

**What this version changes.**
- `SKILL.md` keeps upstream's Philosophy section and the horizontal-slices anti-pattern, and replaces the rest:
  - a "Before You Start" section (find the test runner and run it, match existing test patterns, identify the public
    interface);
  - a per-slice sequence, including "if it passes immediately, the behavior exists or the test is wrong" and "run all
    tests, not just the new one";
  - "What to test" and "What NOT to test" lists (private methods, call counts, framework behavior);
  - mocking rules inline (mock at seams, one adapter means do not mock, two adapters is a real seam, never mock what
    you own);
  - a refactoring section and a closing rules list.
  - Removed: upstream's planning checklist and its links to `deep-modules.md`, `interface-design.md` and
    `refactoring.md`, which are not part of this skill.
- `mocking.md` is rewritten: when and when not to mock, the shape of a good mock (simple and dumb, versus one that
  reimplements the real thing), and a test-doubles hierarchy. Upstream's dependency-injection and SDK-style examples
  are not included.
- `tests.md` is upstream's, with the "bypasses the interface" database example replaced by a naming-convention section.

**What this version changes (from pstack, 2026-10-17).**
- "No test is too small" is replaced by pstack's "prefer no new test over a bad test", with its list: mostly tests
  mocks, encodes implementation details, depends on timing or unrelated global state, needs expensive infrastructure
  for a small fix, would be deleted right after proving the fix. For a fix or a small change with only such a test on
  offer, the closest executable check replaces it, shown failing before and passing after, and the report says which
  check and why. A feature built test first still starts every slice with RED.
- "Before You Start" no longer sets up test infrastructure for a small fix in a project with no test path.
- The two-edit check from principle-test-behavior-not-implementation: break the behaviour (the test must fail),
  change only the internals (the test must still pass). It points at `mutation-test` if it is installed (its harness
  and `--refactor` mode) and gives the steps by hand. The harness pointer says it needs committed work, one file per
  edit, and paths from the repository root; the refactor edit runs every covering test, and a build error blames the
  refactor.
- "Take the expected value from the requirement, not from a run of the code" and "an exact error message pins wording
  no caller reads" join "What to test".
- The "querying a database directly" example of a bad test is gone: state a caller can read back, such as a stored
  row, is behaviour.
- From principle-sequence-verifiable-units, an idea only: a bug fix commits the failing test before the fix, so red
  then green can be replayed.
- The refactoring rule now says a test that breaks on a refactor either caught a behaviour change or is pinned to the
  implementation.
- Not taken: pstack tdd's bug-fix-only scope, its "Guardrails" and "Final Response" sections, and
  principle-test-behavior-not-implementation's paragraphs on mocked-service payloads and invariants.

**Why.** I wanted the skill to work from the first message in an unfamiliar repository (find the runner, match the
patterns) and to carry the mocking rules in the main file, where they are read. The pstack changes stop it from pushing agents to add
brittle tests to every small fix, and give a check for whether a test is worth keeping.
