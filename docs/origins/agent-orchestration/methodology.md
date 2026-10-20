# methodology (Original)

Back to the [origins index](../../ORIGINS.md).

The method document, two of its adoption prompts and its templates, from a kit I extracted from a production project
and have since copied into several repositories. The prompt for retrofitting an existing project and the worked
examples were left out: both were written for specific projects.

**Problem.** A capable model produces artifacts that look finished. The method takes the power to certify work away
from the agent that built it: contracts with `verify` clauses, an evidence standard, separate builder and evaluator
contexts, convergence by adversary, mutation verification, falsified premises, two-file state.

**Changes for this release.** The source project's name, a file name and a run ID in the examples were replaced with
generic descriptions; a `SKILL.md` routes to the right door and the templates.

**Later changes (2026-10-18).** Ideas from pstack (`autonomous-run.md`, `docs/guide/07-overnight.md`,
`show-me-your-work`), in new words (1 of 379 word 6-grams, the phrase "a plateau is not a stop"): a wrong log entry is
corrected by a new entry that supersedes it; a plateau is not a stop and is not convergence; a finish condition is
never relaxed to end a run (that is the contract-wrong branch, so it goes to the human); every unattended or
open-ended run has a stop (a dead end or a budget), recorded in `PROJECT.md` and owned by the human.
