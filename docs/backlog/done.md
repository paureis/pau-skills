# Done

[Back to the backlog index](../BACKLOG.md)

Work from 2026-10-17 to 2026-10-19 (the first six batches) is in
[done-2026-10-17-to-19.md](done-2026-10-17-to-19.md), and work from 2026-10-20 to 2026-10-25 (the seventh to the
twelfth batches) is in [done-2026-10-20-to-25.md](done-2026-10-20-to-25.md).

- 2026-10-29: the thirteenth batch, Q16 trigger tests and a skill usage log, merged as
  [pull request 59](https://github.com/paureis/pau-skills/pull/59). `eng-lead` planned four slices (the trigger mode,
  the request lists written blind, their shape test, the hook and report); a fifth (the baseline in parts) followed the
  paid round. Every brief had a read-only plan check that built the slice in a clone, every slice a fresh reviewer, a
  fix round and a second look. The first paid round: 380 one-turn runs for 34.10 US dollars (cap 40), no wrong starts,
  175 of 228 hits, 41 of 53 misses after a look around the empty folder. 1,470 tests (1,357 before). skill-eval and
  which-skill went to the owner as zips; `pau-skills-hooks` went to 0.4.0, and the profile README says 14 hooks. With
  the roster:
  - Worked: `eng-lead` handing back at once with the builders' IDs; splitting the list slice so its fix round stayed
    blind; a hash-based overlap checker that told the blind writer what to reword without showing a phrase; plan checks
    that found real problems in all five briefs, among them a cap that could be passed and tests that wrote to the
    real HOME; a reviewer that read the lists as data and found 10 weak requests before the money was spent; the first
    paid transcripts doubling as the fact check.
  - Did not: the cap rule needed the review to find that reserving the price still passed the cap; the first summary
    was 210 KB and needed a fifth slice to fit the size rule; a container restart lost one review; builders and a
    reviewer still wrote `2>/dev/null`.
- 2026-11-04: the fourteenth batch, Q17 descriptions that start their skill, merged as
  [pull request 62](https://github.com/paureis/pau-skills/pull/62). `eng-lead` planned two slices: the code
  (`--max-turns`, the turn of a start, the two-turn lists) in full, and the rewording as a draft the orchestrator
  filled after the rerun. Each brief had a read-only plan check, each slice a fresh reviewer; one fix round. The two
  paid runs: 41 two-turn runs for 4.49 US dollars (no start in turn 2), then 380 one-turn runs for 34.67 (cap 40): no
  wrong start, 152 of 152 near misses right, 186 of 228 hits (175 before); six of the ten reworded skills went up,
  four stayed at 2 of 6. 1,489 tests. Eleven skills went to the owner as one bundle. With the roster:
  - Worked: `eng-lead` handing back at once with each builder's ID; a draft brief with fields to fill after the paid
    rerun; plan checks that built or tried each slice (nine surviving mutations in A, four ways past the blind rule
    in B); a builder and a reviewer kept away from the lists, with test output read only through a grep; the cheap
    rerun before the expensive round.
  - Did not: four description rules (curly quotes, a backticked name with "if installed", the opener, quoted remarks)
    have no test and were checked by hand; four reworded skills did not move, and one round cannot tell a change of 1
    or 2 hits from noise.
- 2026-11-04: the fifteenth batch, Q18 tests for the description rules checked by hand, merged as
  [pull request 65](https://github.com/paureis/pau-skills/pull/65). `eng-lead` planned one slice; a read-only plan
  check built it in a clone first, one builder built it, a fresh reviewer checked it, and one fix round followed with
  a second look. `tests/description-rules.test.mjs` holds the four rules, each proven on a real description with
  `mutate.sh`, and the confirm list moved to `tests/confirm-list.mjs`. 1,500 tests (1,489 before). No skill changed,
  so there were no zips. With the roster:
  - Worked: `eng-lead` handing back at once with the builder's ID; a plan check that built the slice and found two
    done-when items that could not pass and 16 surviving mutations before the build; a proof table that named the
    test each mutation must fail; resuming the builder by ID after a container restart.
  - Did not: the review still found six mutations no fixture caught, and two kinds of character the rules as written
    let through (other question marks, quote ornaments), left to the owner.
- 2026-11-05: the fifteenth batch's second part, Q19 descriptions in printable ASCII only, merged as
  [pull request 67](https://github.com/paureis/pau-skills/pull/67), from the owner's answer on the Q18 decisions page
  (decision 21). The same shape as Q18: one slice, a plan check that built it in a clone, one builder, a fresh
  reviewer, one fix round and a second look. Rule 1 now flags every character outside U+0020 to U+007E; 1,500 tests,
  as before. With the roster:
  - Worked: proving each gap SURVIVED at the base before the change; a sweep of every BMP code point; a reviewer that
    checked rule 1 against a hand-written decoder on every code point.
  - Did not: the orchestrator's own correction put the only bad skill last in the multi-skill case, so a rule that read
    only the last skill passed every test until the review; the test file is now 189 bytes under the size limit.
