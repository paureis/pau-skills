# Done

[Back to the backlog index](../BACKLOG.md)

Earlier work is in three files: 2026-10-17 to 2026-10-19 (the first six batches) in
[done-2026-10-17-to-19.md](done-2026-10-17-to-19.md), 2026-10-20 to 2026-10-25 (the seventh to the twelfth batches)
in [done-2026-10-20-to-25.md](done-2026-10-20-to-25.md), and 2026-10-29 to 2026-11-06 (the thirteenth batch to Q20)
in [done-2026-10-29-to-11-06.md](done-2026-10-29-to-11-06.md).

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
- 2026-11-26: between batches, `compact-snapshot` stops a third compaction (decision 38), released as v0.26.0. Built
  directly at the owner's request. A probe showed a PreCompact `{"decision":"block"}` stops `/compact`; a live run of
  three `/compact` calls in one session ran two and refused the third with the reason. 2,130 tests; seven mutations,
  all caught.
- 2026-11-27: the twenty-fifth batch, Q35 `wizard`, merged as
  [pull request 102](https://github.com/paureis/pau-skills/pull/102) and released as v0.27.0. A new model-invoked
  skill in session-discipline, adapted from mattpocock/skills: a JSON steps file the person runs with `wizard.mjs run`,
  checked step by step, and `status` for the agent afterwards; the script never takes a value. One slice: `eng-lead`
  planned it, a read-only plan check built a rough version in a clone and ran its own mutations, one builder, one fresh
  reviewer, one cold run (headless, empty HOME, 0.66 and 0.07 US dollars), one fix round and a second look. 2,170 tests
  (2,130 before), 22 mutations caught. With the roster:
  - Worked: the plan check closed six gaps before the build (a URL with a password in an error message, a test that
    could not see a browser being opened, proxy variables in the local server tests); the reviewer found a real hang
    (a streaming URL) and three ways a value could still be printed, all fixed in one round; the cold run showed the
    skill start on its own, wait for the yes, never run `run` and leak the planted value nowhere, and found six
    instruction gaps the review could not.
  - Did not: the harness branch of the worktree held no commits (the builder used the brief's branch name), so the
    first merge did nothing; Windows was never run; a token in a command check's argv is still printed, covered by a
    rule in SKILL.md instead of code.
- 2026-11-27: the twenty-eighth batch, Q43, merged as
  [pull request 108](https://github.com/paureis/pau-skills/pull/108), with no release (tests and CI only, no plugin
  bumped). One slice from one `eng-lead` plan: `tests/geppetto-roster-lock-base.test.mjs` reads `LOCK` at a base
  commit, and CI checks out the full history and names the base. A read-only plan check built a prototype in a clone,
  one builder did the work, a fresh reviewer checked it, and one fix round closed its finding. 2,258 tests (2,238
  before).
  - Worked: the plan check found that `HEAD^1` gives a wrong verdict on a multi-commit push to main, three branches no
    test could fail, and a 2 second git timeout that could skip the check on a slow runner, all fixed in the brief;
    the reviewer found a surviving mutant (the merge base read as the origin/main tip) that would fail any branch
    behind main, closed in one round; CI showed all four test jobs naming base `HEAD^1` at main.
  - Did not: a no-base outcome in CI passes with only a log line (Q44); the builder's mutations of a file that holds
    its own tests first gave a false SURVIVED, because the sed pattern also hit the asserting lines.
- 2026-11-27: the twenty-seventh batch, Q40, Q41 and Q42, merged as
  [pull request 106](https://github.com/paureis/pau-skills/pull/106) and released as v0.27.2. Three slices from one
  `eng-lead` plan: seven new rows and two fixed rows in rule-to-hook's HOOK-EVENTS.md, a roster lock test, and the
  watchdog reading agent folders the way Claude Code does. Four probe rounds settled Q42 before and during the plan;
  each brief had a read-only plan check that built the slice in a clone, each slice a fresh reviewer and one fix
  round, and a cold run (real hooks, headless, empty HOME, 0.73 US dollars) covered Q42. 2,238 tests (2,180 before).
  - Worked: the plan checks found real gaps in all three briefs (Q40 missed four candidate events and two wrong old
    rows; Q41's went-down message gave the wrong fix; Q42 missed a test file, an exact description rule, name-order
    dependence and an entry cap); every review found something worth fixing (a ConfigChange exception only the code
    shows, a weakened test, a git history passing the folder limit); probing during triage settled questions in one
    cheap run each.
  - Did not: builders again could not reach a scratch clone through git (the worktree guard), so references to the
    plan checker's draft were unusable; the cold run's subagents made no tool calls, so the watchdog's in-subagent
    paths were not exercised live.
- 2026-11-27: the twenty-sixth batch, Q34, Q36 and Q39, merged as
  [pull request 104](https://github.com/paureis/pau-skills/pull/104) and released as v0.27.1. Three small follow-ups
  as three slices in parallel worktrees: a `UserPromptExpansion` row in rule-to-hook's HOOK-EVENTS.md, the split rule
  in the file-size-guard recipe, lazy-senior's REVIEW.md and the roster builder (roster 8), and two hook fixes
  (`compact-snapshot` shows this session's newest snapshot; the watchdog skips agent files with no frontmatter). Each
  brief had a read-only plan check, each slice a fresh reviewer, and one cold run (headless, empty HOME, real hooks,
  0.04 US dollars) covered Q39. 2,180 tests (2,170 before). With the roster:
  - Worked: the plan checks fixed two briefs before any build (a done-when that could not be met as written, and
    mutants for the BOM, the cap and trimEnd that would have survived); the Q34 reviewer checked every fact in the row
    against the binary; the Q39 reviewer found two surviving mutants, closed in one fix round; the cold run showed the
    base failing both Q39 items and the change passing them.
  - Did not: the Q34 and Q36 reviews found nothing to fix, so their cost bought only confidence; the cold run found
    that Claude Code's YAML parser is looser than the watchdog's, which no probe had asked (Q42).
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
