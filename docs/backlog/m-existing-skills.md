# M. Changes to existing skills

[Back to the backlog index](../BACKLOG.md)

**M1 tdd** (`done`). Upstream: `skills/tdd/SKILL.md`, `skills/principle-test-behavior-not-implementation/SKILL.md`,
`skills/principle-sequence-verifiable-units/SKILL.md`. Replace "no test is too small" with "prefer no new test over
a bad test" and its list (mostly tests mocks, encodes implementation details, depends on timing or unrelated global
state, needs expensive infrastructure for a small fix, would be deleted right after proving the fix). Do not build a
test path from scratch only to satisfy the workflow; say what evidence replaces it. Add the two-edit check (break the
behaviour: the test must fail; change the internals: the test must pass), pointing at `mutation-test` for the first
edit. Expected values come from the requirement, not from a run of the code; an exact error message pins wording no
caller reads. Revisit the rule that checking the database directly is a bad test: a stored value read back is
behaviour.

**M2 rule-to-hook** (`done`). Upstream: `skills/correct/SKILL.md`, `docs/guide/09-make-it-yours.md`. Add the fix
order (architecture, types, lint or CI check, test, prose), the ratchet for patterns already common ("fail only when
a change adds more"), lint errors that name what to use instead, a rule table pairing each rule with its enforcer,
and exceptions with a reason, an expiry and a human's approval. Prove each new check on a real past mistake when one
exists.

**M3 mutation-test** (`done`). Prefer a real past mistake from git history as the mutation when one exists. Add an
optional second check from the two-edit test: a pure refactor of the internals must leave the test green.

**M4 review-triage** (`done`, keep both `TRIAGE.md` copies identical). Upstream:
`skills/interrogate/references/lead-judgment.md`, `skills/poteto-mode/references/bugbot-triage.md`. Add "nitpick
gravity" (if a reviewer's findings are all nits and preferences, the code is probably fine; say so), "I would have
done it differently" as the most common false positive, and a learned-pattern format for recurring findings
(confidence: candidate, recurring, strong; skip when; do not skip when).

**M5 retrospective** (`done`, fourth batch). Upstream: `skills/reflect/references/synthesizer.md`,
`references/divergent-reviewer.md`. Gate each proposed edit on "decision-changing: a future agent does something
different because of the edit, not just reads more text". Add a lens for "decisions that worked but for the wrong
reasons".

**M6 lean-subagent-dev** (`done`, keep both copies of shared files identical). Upstream:
`skills/setup-pstack/SKILL.md`, `skills/poteto-mode/playbooks/orchestrate.md`. Add an effort level per role (builder,
plan checker, reviewer) to the budget table through the Agent tool's `effort` field; never name a model that has not
been confirmed available; refuse to launch a subagent while a brief field is empty; never resume a subagent only to
check on it, judge by side effects; standing orders pasted into every brief.

**M7 codebase-oracle** (`done`). Upstream: `skills/why/references/epistemics.md`, `skills/how/SKILL.md`,
`skills/how/references/*.md`. Replace the three answer buckets with five tiers (direct, supported, inferred,
speculative, unknown) and the phrasing each allows; "never cite code as evidence for its own intent"; treat the
user's guess as one candidate among others. For big questions, 2 to 4 explorers on separate angles, then one
explainer; answer format Overview, Key concepts, How it works, Where things live, Gotchas. History questions through
git and `gh` first.

**M8 safe-merge and evaluator** (`done`, fourth batch). Upstream: `skills/poteto-mode/playbooks/shipping.md`,
`docs/guide/06-verify-and-ship.md`. A verdict covers a patch: compare `git patch-id` at the verdict commit with the
current head before trusting an older verdict after a rebase. Evaluator: evidence by change type (a CLI change runs
the real command, a parser or migration replays a saved input, a storage change reads the value back) and
"inconclusive" when a check could not run.

**M9 improve-codebase-architecture** (`done`, fourth batch). Upstream: `skills/architect/references/design-red-flags.md`,
`skills/principle-minimize-reader-load/SKILL.md`, `skills/principle-model-the-domain/SKILL.md`,
`skills/poteto-mode/playbooks/refactoring.md`. Add the agent-contributor red flags, the reader-load test, the
model-the-domain signs, and for execution: pin behaviour with a characterization test first ("type check and lint
are not a pin"), migrate callers and delete in one wave.

**M10 which-skill** (`done`, fourth batch). Upstream: `skills/poteto-help/SKILL.md` and `references/`. A "fix a run that went
wrong" symptom table; check state only when it changes the answer; when a skill is missing from the router's table,
read its frontmatter and route by its description; the prompt checklist (or point to `sharpen`).

**M11 small additions** (`done`, fourth batch).
- `methodology`: "a plateau is not a stop"; never relax a finish predicate; an append-only decision log.
- `parallel-worktrees`: a "race" shape with the selection rule declared before spawning; "instructions and
  conventions are not concurrency control"; a cleanup audit's bucket is advice, not permission.
- `handoff`: when resuming, treat the previous trail as the record and do not redo work, then verify inherited claims
  on the artifact.
- `ci-cost-and-cadence` or `flaky-test-hunt`: classify a CI failure before retrying: one retry only; an identical
  second failure is not a flake; a failure in code the diff never touches suggests a stale base
  (`git merge-base --is-ancestor`).
- A possible hook: report newly added lint suppressions that carry no reason (`eslint-disable`, `@ts-ignore`,
  `# noqa`, `# type: ignore`, `//nolint`, `#[allow(`, `@SuppressWarnings`), from upstream `skills/no-comments`.
