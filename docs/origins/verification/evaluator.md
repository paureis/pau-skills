# evaluator (Original)

Back to the [origins index](../../ORIGINS.md).

From the methodology kit's evaluator prompt (see [`methodology`](../agent-orchestration/methodology.md)).

**Problem.** An agent cannot certify its own work. In one project, an evaluator that had not seen how the code was
built found a security test that asserted its own mock, a module with zero coverage inside a green suite, and twelve
bypasses of a boundary gate the builder believed airtight. The prompt had to be pasted into a fresh chat; as a skill
it runs with `context: fork`, so it starts without the builder's conversation by construction.

**Changes for this release.** Converted from a paste-in prompt to a forked skill with `$ARGUMENTS` for the scope; it
points at `mutate.sh` for mutation checks; the notes for the human running it moved to the end.

**Later changes (2026-10-18).** Ideas from pstack (`docs/guide/06-verify-and-ship.md`,
`skills/poteto-mode/playbooks/shipping.md`), in new words (0 of 630 word 6-grams): what counts as a live reproduction
for each change type (a storage assertion about the stored form reads the raw value), a check that could not run marked
UNVERIFIED with `inconclusive:` (a resource the change requires is not a FAIL), and an `Evaluated:` line naming the
commit, base and patch id the verdict covers, withheld on a dirty tree.

**Later changes (2026-10-19).** A cold run of the fourth batch showed an agent reading "a passing automated test that
you have run and watched pass" as enough evidence without the mutation check the same skill requires, and filling the
`Mutation:` field with a claim it never ran. A passing test now counts only once its mutation check made it fail, an
unrun "would catch" is not evidence, and the `Mutation:` field records the defect, the command and CAUGHT, SURVIVED or
NOT MUTATED, with what each means for the verdict.
