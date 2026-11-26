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
- 2026-11-06: Q20 verify-before-done without false alarms, merged as
  [pull request 69](https://github.com/paureis/pau-skills/pull/69), after another chat reported about ten false
  alarms in one session (decision 22). One slice, a plan check that built it in a clone, one builder, a fresh reviewer,
  one fix round and a second look. Only edits inside the project count; Monitor commands and six package-manager flags
  count as checks; this repository names its own checks as `testCommands`. 1,543 tests (1,500 before);
  `pau-skills-hooks` 0.4.1, so the owner updates the hooks plugin on each computer. With the roster:
  - Worked: reproducing the report with the hook's own function before planning; settling the test file layout before
    the plan check; a reviewer that ran the old and new hooks side by side as processes and timed long inputs.
  - Did not: no plan check and no listed mutation caught the flag pattern's exponential time; only the reviewer's
    timing did.
- 2026-11-18: the eighteenth batch, Q24 verification ideas from the Claude Code team, merged as
  [pull request 76](https://github.com/paureis/pau-skills/pull/76) (decision 26). Four slices on the roster: the
  diff-triggered checklist, property and differential tests beside it, rules from the merge base with REVIEW.md and
  the `RULES` flag on the checklist's merge, and geppetto roster 6 merged last with the installed copies. Every brief
  had a read-only plan check that built the slice in a clone, every slice a fresh reviewer and one fix round. 1,892
  tests (1,807 before); 11 skills changed, no hook. Q25 (Claude Code mods) was added to the backlog. With the roster:
  - Worked: plan checks that prototyped each slice found the hostile git settings, the rules file triggering itself and
    a REVIEW.md loophole before any builder started; reviewers that ran their own mutations found tests that could not
    fail in every slice; a separate roster slice merged last kept one reviewer for the whole batch.
  - Did not: the builders came back in the background, so `eng-lead` only planned and launched, and the main session
    started the reviewers and sent the fix rounds; the owner's profile README could not be updated from the session
    (the repository is outside its access).

- 2026-11-23: the nineteenth batch, Q21 a subagent watchdog, merged as
  [pull request 79](https://github.com/paureis/pau-skills/pull/79) (decisions 22, 23 and 30), with Q26 parked and Q27
  added (decisions 28 and 29). One slice on the roster: a new `subagent-watchdog` hook (agent-orchestration 0.13.0,
  `pau-skills-hooks` 0.6.0). A read-only plan check built the slice in a clone, a headless prototype (0.02 US dollars)
  settled six hook facts, one builder built it test first, a fresh reviewer and one fix round followed. 1,946 tests
  (1,892 before); 89 mutations caught. With the roster:
  - Worked: `eng-lead` raised five questions the settled design had not covered, which the owner answered in one
    prompt; the plan check found six blockers before any code (false asks on healthy runs, a test that could not
    fail, a planted folder link that prune would follow); the prototype showed that TaskStop fires no SubagentStop and
    a failed command fires PostToolUseFailure, so the brief was right before the build; the reviewer found the one
    must-fix (parallel Agent calls read as stuck) by driving the hook through eng-lead's own way of working.
  - Did not: the builder came back in the background again, so `eng-lead` only planned and launched; the orchestrator
    committed decision 30 without running the suite and pushed `decisions.md` over its size limit, which the merge's
    test run caught.
- 2026-11-24: Q27 Claude Ship and our skills, merged as
  [pull request 80](https://github.com/paureis/pau-skills/pull/80) (decision 29). `lean-subagent-dev` and `safe-merge`
  name `/ship`; option 3 needed nothing (the local `/code-review` reads no `REVIEW.md`). Two prose edits made by the
  orchestrator, one fresh reviewer, one fix. With the roster:
  - Worked: reading the docs before the brief turned option 3 into a finding instead of a build; the reviewer, with the
    docs facts as its contract, found the one real gap (a merge after `/ship` pushed unchecked fixes).
  - Did not: `eng-lead`, the plan check and a builder were skipped as too heavy for two paragraphs; the kickoff asked
    for the full roster.
- 2026-11-24: the twentieth batch, Q28 some skills typed only again, Q29 friction-review, Q30 small additions from
  upstream and Q31 patch notes, merged as [pull request 83](https://github.com/paureis/pau-skills/pull/83)
  (decisions 31 and 32). Seven skills became typed only, friction-review is new, nine skills took a few lines each
  from mattpocock/skills at abeeaf9, and each batch now ships a GitHub Release (v0.22.0 first). Two `eng-lead` runs
  planned seven slices (Q28, Q29, then S1, S2 with S4, S3 and S5 in parallel); every brief had a read-only plan check
  that built it in a clone, every slice a fresh reviewer and one fix round. 2,034 tests (1,946 before). With the
  roster:
  - Worked: the owner's rule for skills that go together, applied to a full start map, cut the typed-only list from 14
    to 7 with only two "type /name" pointers; plan checks that measured sizes and read the installed binary
    (`worktree.bgIsolation`, the question tool's limits) before any builder started; reviewers that built hostile
    fixtures found two privacy leaks in friction-review and an image bypass in the release check; four builders in
    parallel on disjoint files, with the shared files kept by the orchestrator, merged with no conflict.
  - Did not: eng-lead's size targets were already broken at the base; builders wrote code before tests for parts of
    friction-review's CLI; `gh api markdown` is refused from a session, so emoji shortcodes were not rendered before
    the merge; an inline `node -e` payload broke on an apostrophe in the orchestrator's own CHANGELOG edit.
- 2026-11-26: the twenty-fourth batch, Q38 subagent-watchdog fixes and a compaction count, merged as
  [pull request 98](https://github.com/paureis/pau-skills/pull/98) and released as v0.25.0. Hooks only. Two slices in
  parallel: S1 the watchdog (an edit counts wherever the file is, a project or user agent whose definition cannot edit
  is read-only, a call in flight for two hours is dropped, two status lines), S2 `compact-snapshot` (a compaction count
  stored at PreCompact and a hand-off line from the second compaction, option `handoffAfter`). Item 6, the ask log,
  was not built, by decision. Probes before planning settled that the new compact_boundary line is not on disk when
  SessionStart compact fires (manual and auto) and that SubagentStart's agent_type is the definition's `name:` line.
  Each brief had a read-only plan check that built the slice in a clone, each slice a fresh reviewer and one fix
  round, and one cold run covered both (empty HOME, real hooks). 2,122 tests (2,062 before). With the roster:
  - Worked: the plan checks found real gaps before any build (S2 undercounted two compactions with no reply between
    them, which led to storing the count at PreCompact; S1's probe as written was refused and its logic file needed a
    split); each reviewer found one real defect (S2 a count leaking from another session, S1 a broken project
    definition letting a home one mark an editor read-only), both fixed in one round; the cold run showed an edit
    outside the project reset the count from 5 to 0 and the second compaction print the hand-off line.
  - Did not: a single note per agent cannot show a reset in a live run, so the reset was read from a replay of the
    recorded events; hooks/README.md ended 14 bytes under its limit.
- 2026-11-26: the twenty-third batch, Q37 reframe and sharpen from pstack, merged as
  [pull request 96](https://github.com/paureis/pau-skills/pull/96) and released as v0.24.0. `reframe` is new and
  upstream's newer `sharpen` replaces ours, both typed only, both bodies byte for byte as pstack at 41e4009; only the
  descriptions and the attribution lines are ours, and `tests/pstack-verbatim.test.mjs` compares the bodies with
  committed copies of upstream. One slice: `eng-lead` planned it, a read-only plan check built it in a clone, one
  builder, one fresh reviewer, no fix round, and a cold run of each skill (0.13 and 0.21 US dollars). 2,062 tests (2,054
  before). With the roster:
  - Worked: the plan check found two weak assertions (a presence-only frontmatter check, a splitter that could cut at
    the last `---`) before the build, and both mutants were caught after it; a narrow exception that let the builder
    edit only the two typed-skill lists kept the slice's suite green, so every mutation ran on a passing control; the
    cold run settled that text after `/sharpen` reaches a body with no `$ARGUMENTS`.
  - Did not: the cloud network refused every page fetch, so `reframe`'s link check was never exercised (it cut every
    citation, as its body says); the orchestrator's README edits went 90 tokens over the file's limit and had to be
    cut back to 7 bytes under.
