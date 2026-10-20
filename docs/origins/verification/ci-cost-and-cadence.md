# ci-cost-and-cadence and `measure-minutes.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

Derived on 2026-10-04 from the CI redesign of a private project, and written from scratch in general terms.

**Problem.** A private repository was spending about 240 Actions minutes a day against a 3,000-minute monthly
allowance, on track to run out around day 12, and every PR push waited about 20 minutes for an end-to-end suite that
coding agents triggered several times per PR. The first idea, "full suite once per PR", was measured before building
and did not hold: most full runs came after the PR's first green run, in review rounds. Classifying the suite's red runs
showed that almost none caught a user-facing defect that a full local run would have missed; most were flaky tests,
infrastructure, or mistakes in the workflow. The project chose a nightly run with safeguards. An adversarial critique
of the design and two review rounds of the build then found the traps listed in `TRAPS.md`: a skipped job or a
same-named nightly job satisfying the production check, an empty green night becoming the reference, a cap that let a
hung suite bill again on every trigger, a merge gate fooled by a three-dot comparison, and a push guard that a plain
push from the integration branch walked past.

**Changes for this release.** Everything specific to the source project was removed: names, branch and check names,
paths, the domain and the language. The source's scripts are not included; the decision and the local record are
pseudocode templates, and the workflow files are skeletons with placeholder names. `measure-minutes.mjs` is new,
generalised from the project's measurement script (repository and grouping are arguments; runner multipliers added).
**The savings are projected, not observed**: when this was written the first scheduled nightly run and the one-week
before/after measurement had not happened yet, so the figures in the worked examples are estimates.
