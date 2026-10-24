# Done

[Back to the backlog index](../BACKLOG.md)

Work from 2026-10-17 to 2026-10-19 (the first six batches) is in
[done-2026-10-17-to-19.md](done-2026-10-17-to-19.md).

- 2026-10-20: Q1 test-value audit, merged as [pull request 31](https://github.com/paureis/pau-skills/pull/31), the
  first batch run with the roster. Phase A: `eng-lead` planned three audit slices, a read-only plan check fixed every
  brief, three builders ran 447 mutations over all 39 test files, and three fresh reviewers reran 219 of them. Phase B,
  after the owner chose what goes: the same shape, with plan checks that built each whole slice in a clone first, one
  fix round and a second look. 1 test removed, 12 added, about 40 rewritten or isolated; 1,166 to 1,177 tests, green on
  Linux and macOS. Tests only, so there were no zips; the profile README now says "with over 1,100 tests". With the
  roster:
  - Worked: the `eng-lead` briefs were thorough and caught false parts of the item; plan checks and reviewers found
    real problems every time; long briefs as files the agent reads, with a corrections section, kept each round in
    step.
  - Did not: nesting was off (depth 1 in the cloud), so the main session ran every agent; two container restarts cut
    off agents whose status said "completed"; the worktree guard refused HOME, GIT_CONFIG_GLOBAL and shell loops, so
    those runs went to the reviewers; builders still wrote to /dev/null, and missed shared rules unless a brief named
    them. The per-file audits went to the owner as a zip, since the session cannot push the audit branches.
- 2026-10-20: Q4 file-size guard, merged as [pull request 33](https://github.com/paureis/pau-skills/pull/33), the
  second batch run with the roster. `eng-lead` planned 15 slices (14 splits, then the hook) and wrote the briefs; a
  read-only plan check built each slice in a clone and corrected every brief; 15 builders in worktrees, a fresh
  reviewer per slice, fix rounds on four slices with a second look, and a headless cold run of the hook (four
  sessions, empty HOME). The 26 files over 5,000 tokens were split with text moved unchanged, the new
  `file-size-guard` hook and `tests/file-size.test.mjs` keep every tracked file under the limit, and the suite went
  from 1,178 to 1,249 tests, green on Linux and macOS. The 12 changed skills went to the owner as one bundle (all
  replacing), `pau-skills-hooks` went to 0.3.0, and the profile README now says 13 hooks. With the roster:
  - Worked: briefs as files with a common part and a "Corrections after the plan check" section, so one correction
    reached every brief at once; plan checks that built the whole slice in a clone (all 15 found something);
    moving text with sed by line range, checked by a moved-lines diff plus a per-range diff; a full-name test
    reporter that sees a test moved between describes; the cold run, which found five problems with the refusal
    message that no reviewer saw.
  - Did not: nesting was still off, so the main session ran about 50 agents by hand; the builders' worktree guard
    refused many compound commands (finds that name `./.git`, `env -u`, shell variables passed to sed or node), so
    every builder rediscovered the script-file workaround; agents still wrote to /dev/null now and then; and the
    orchestrator once committed to the profile repository under the owner's name by copying the last commit's
    author. Use the session's default author.
- 2026-10-22: Q10 what the Q1 audit and the Q4 reviews left, merged as
  [pull request 38](https://github.com/paureis/pau-skills/pull/38), the last item of the seventh batch and the first
  run with nesting on. `eng-lead` planned six slices with disjoint files (the `instructions-audit` text, tests for
  hooks, for verification scripts and for agent-orchestration and planning scripts, the `secret-guard` dead line, the
  hanging flaky-test-hunt fixture) and started the six builders itself; a read-only plan check built each slice in a
  clone first and corrected every brief; a fresh reviewer per slice, fix rounds for three slices with a second look,
  and three cold runs of `instructions-audit` (the base, the build and the fix, each headless with an empty HOME and
  nobody to answer). 20 tests added, each proven by a mutation that survived before and is caught after (54
  mutations); 1,249 to 1,269 tests, green on Linux and macOS. The changed `instructions-audit` went to the owner as a
  bundle (the one from the follow-up, with decision 12), which the owner uploaded, and `pau-skills-hooks` went to 0.3.1
  for `secret-guard`, which the owner updated on their computers. The profile README counts (38 skills, 13 hooks,
  over 1,100 tests) still hold. The owner's two decisions after it (decision 12) were applied in the follow-up pull request. With the roster:
  - Worked: `eng-lead` read the code well and found more than the item named (19 untested lockfile names, a second
    surviving `keyOf` mutation, a swap hidden by equal counts); every plan check found something, and one caught a
    glob that matched no file, which would have made every base run a false SURVIVED; reviewers found a real problem
    in three of six slices; the cold run found what the reviewer could not, a refused shell form in headless use.
  - Did not: `eng-lead` started the builders in the background and handed back before they reported, so the main
    session started the reviewers and sent the fix rounds; a backslash-u escape typed into a tool call reached the
    brief as the raw character, and the builder copied it into a test.
- 2026-10-23: the eighth batch, Q3 designer agent and Q8 production rules from day one, merged as
  [pull request 41](https://github.com/paureis/pau-skills/pull/41). The Figma connector failed again, so Q3 works on a
  design system in code. `eng-lead` planned two slices (`production-rules`: the source rules file in
  `launch-readiness` with copies and changes in `project-setup` and `rule-to-hook`; `geppetto`: the rules block,
  roster 3 and the designer template) and fixed the shared rules text in the plan, so both builders copied one file.
  A read-only plan check built each slice in a clone first; a fresh reviewer per slice; three cold runs (Create and
  the designer on a fixture design system; project-setup on the two Q6 fixtures through the eval harness; a feature
  built with and without the rules, graded by `launch-readiness`); one fix round per slice and a second look. 1,269 to
  1,285 tests, green on Linux and macOS. Five changed skills (`geppetto`, `launch-readiness`, `project-setup`,
  `rule-to-hook`, `which-skill`) went to the owner as one bundle. The profile README counts (38 skills, 13 hooks, over
  1,100 tests) still hold. The owner's four decisions are on an html-plan page, and what they decide is Q11. With the
  roster:
  - Worked: `eng-lead` gave exact line numbers, the rules text, a mutation table with the expected `# tests` count of
    each run, and the one red roster test with the merge recipe that clears it. Both plan checks found something
    that would have shipped wrong advice or blocked a builder: a Stripe `pk_` key treated as a secret, a query checker
    that cannot see concatenation, a regex that failed a correct fixture, two tests that could not fail. Each
    reviewer found something the builder missed, one of them a must-fix (Update would have merged the designer
    template's placeholders over a project's design system). The cold runs found what no reviewer could: rules
    written on one line dropped clauses, and project-setup never showed its introduction first, at the base too.
    With the rules, the feature kept money in integer cents; without them, refunds were float dollars.
  - Did not: the builders ran in the background again (planned for, so it cost nothing); a prose fix for the
    introduction passed review and failed its control run, so it went to the owner instead of a third round; one
    builder added model trailers to its commits and the other did not, because the standing order and the harness
    disagreed; the orchestrator's first cold-run file hid the personal skill with `--setting-sources project`.
- 2026-10-24: the ninth batch, Q11 what batch 8 left, merged as
  [pull request 44](https://github.com/paureis/pau-skills/pull/44). `eng-lead` planned four slices on disjoint files
  (project-setup with the eval, rule 2 with roster 4, launch-readiness, geppetto); a read-only plan check built each
  slice in a clone, then one builder, one fresh reviewer and one fix round per slice, and a cold run with a base
  control for every changed behaviour. The four changed skills were zipped with `pack-skills --since 532aaa3` and
  sent to the owner; the skill count did not change. What was left went to Q12, waiting on the owner's answers.
  - Worked: handing back at once with the builders' IDs, a reviewer contract file and briefs as files with a
    corrections section. Every plan check found a real problem (a missed caller that ran every eval scenario in an
    empty folder, a clause that let `sku in CATALOG` pass `constructor`, a re-read refused after `--resume`). Every
    reviewer still found something, and the cold runs found the one thing nobody could read off the text: moving
    project-setup's scan after the answer lost its bundled reads in a resumed turn. Base controls made each result
    readable (16 refused reads before, 0 after; 14 to 16 tool calls before the introduction, then 3).
  - Did not: the auto-mode check refused `eng-lead`'s call for one builder, so the orchestrator asked the owner and
    started it; the rule 2 cold run needed four builds per side before the control meant anything; the three eval
    scenarios cost 55 US dollars against an estimate of 30; two claims in the orchestrator's own review note were
    wrong and were corrected by the plan checks.
- 2026-10-24: the tenth batch, Q12 what Q11 left, merged as
  [pull request 47](https://github.com/paureis/pau-skills/pull/47). `eng-lead` planned three slices on disjoint files
  (verify-app, agent-friendly-audit, the eval); a read-only plan check built each slice in a clone, then one builder,
  one fresh reviewer and one fix round per slice, and two cold runs per side with a base control for each changed
  skill. The two changed skills were zipped with `pack-skills --since 30fe24d` and sent to the owner; the counts did
  not change. Four findings went to the owner on an html-plan page; Q13 holds them.
  - Worked: handing back at once with the builders' IDs, briefs and a reviewer contract as files, and base controls
    started while the plan checks ran, which showed the plan where the scratch files really went (a helper script
    written to `/tmp`). Both prose plan checks found a must-fix (a test the brief's own wording would fail, a removal
    that deleted the check's files), every reviewer found something real, and the cold runs gave clean numbers: 2 to
    1 and 2 or 1 to 0 refused writes outside the project.
  - Did not: the orchestrator's `cd` into a worktree moved the session's folder until it moved back; the
    agent-friendly-audit cold run needed a "go ahead" prompt to pass step 1 (with the plain prompt it stops there by
    design); the eval run at 40 turns showed the turn limit was not the problem (the persona never ends); a headless
    verify-app pass still cannot reach its live pass.
- 2026-10-24: the eleventh batch, Q13 what Q12 left, merged as
  [pull request 50](https://github.com/paureis/pau-skills/pull/50). `eng-lead` planned one slice (the persona's end
  rule, with a replay script for the control); a read-only plan check built it in a clone, then one builder, one fresh
  reviewer, one fix round and a second look, then one `spanish-beginner` run and a replay control. No skill changed,
  so `pack-skills --since 4895891` had nothing to pack; the counts did not change. Two findings went to the owner on
  an html-plan page; Q14 holds them.
  - Worked: handing back at once with the builder's ID, briefs and the reviewer contract as files with a corrections
    section. The plan check ran every planned mutation and then its own, and found four unguarded lines of the rule;
    the reviewer found a trigger that could fire mid-interview. The replay control cost cents and showed the real
    cause: the old prompt failed only when the persona could read this repository's CLAUDE.md (1 of 4 inside, 4 of 4
    outside), and the new one held in both places (4 of 4), with 0 of 4 early ends.
  - Did not: the first replay, outside the repository, could not tell the two prompts apart, so the control needed a
    second probe in the original folder; the run cost 6.98 US dollars against an estimate of 20, because Q12's runs
    carried this repository's CLAUDE.md; the worker process restarted once (the agents were continued by ID).
