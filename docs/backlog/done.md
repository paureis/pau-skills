# Done

[Back to the backlog index](../BACKLOG.md)

- 2026-10-17: P0.1 this backlog.
- 2026-10-17: P0.2 context budget, P0.3 NOTICE, P0.4 style word list, N1 verify-app, N2 arena, N3 architect, N4
  bug-fix. Each was built by a subagent in its own worktree, checked by the orchestrator, reviewed by a fresh
  subagent, and fixed in one round (`verify-app` also had a cold run by a fresh agent). Not done from N1: the
  `project-setup` offer to generate a verification skill, because `project-setup` promises not to send beginners to
  other skills; decide whether to make an exception. The auto tier is now full (12 skills, about 50 characters left),
  so a new auto skill needs a description trimmed elsewhere.
- 2026-10-17: N5 hillclimb, N6 agent-friendly-audit, N7 skill-eval, N10 sharpen, N11 brainstorm and P1.1
  pack-skills, merged as [pull request 13](https://github.com/paureis/pau-skills/pull/13). Five builders in parallel,
  each brief checked by a read-only subagent first; every item had a fresh reviewer, a cold run and one fix round, and
  reviewers found must-fix bugs in four of the five. Three bugs the batch found in existing code were fixed in their
  own pull requests and merged after it: nested code fences in `arena` and `instructions-audit`
  ([11](https://github.com/paureis/pau-skills/pull/11)), test suites that left their temporary folders behind
  ([12](https://github.com/paureis/pau-skills/pull/12)), and config files with a byte order mark that were silently
  ignored ([14](https://github.com/paureis/pau-skills/pull/14)). The 12 new and changed skills were zipped with
  `pack-skills`, uploaded to claude.ai and confirmed synced; the profile README now says 34 skills. The audit's findings
  for this repository became P1.2 to P1.4.
- 2026-10-17: M1 tdd, M2 rule-to-hook, M3 mutation-test, M4 review-triage, M6 lean-subagent-dev and M7
  codebase-oracle, merged as [pull request 16](https://github.com/paureis/pau-skills/pull/16). Four builders in
  parallel, each brief checked by a read-only subagent first; every item had a fresh reviewer and one fix round, and
  three had a cold run (the oracle's in two headless sessions with real explorers). Reviewers found a must-fix in
  three of the four. The seven changed skills (the six plus `which-skill`) were zipped with `pack-skills`, uploaded to
  claude.ai and confirmed synced; the skill count stays at 34, so the profile README did not change.
  The owner's open questions from this pull request (whether `lean-subagent-dev` is "adapted", the effort split per
  role, the `metadata.upstream-pstack` key in `tdd`, the ratchet) were settled on 2026-10-19 in decision 8.
- 2026-10-18: P0.5 every skill loads on its own, merged as [pull request 19](https://github.com/paureis/pau-skills/pull/19).
  Four builders by plugin group, each brief checked by a read-only subagent first; a fresh reviewer, a cold run of 20
  headless sessions (10 plain requests, half with stubs of the owner's other plugins), one fix round and a second look
  of six more runs. The owner chose the confirm wording and trimmed the confirm list to 13. Descriptions went from
  18,298 to 11,559 characters. All 34 skills were zipped with `pack-skills --all`, uploaded and confirmed synced.
  Part B, measured locally on the owner's 1M window:
  - before: Skills 9.9k tokens (1.0%, at the cap), 125 skills listed with no description; the upload alone did not
    move the number, because the listing was still full;
  - after turning off 18 synced plugins (sales, legal, finance, human-resources, marketing, common-room, apollo,
    brand-voice, customer-support, slack-by-salesforce, enterprise-search, engineering, operations, product-management,
    data, design, productivity, cowork-plugin-management) and four marketplace plugins (superpowers,
    claude-md-management, code-review, context7), plus Vercel's 33 skills, and moving 13 stale local copies of uploaded
    skills out of `~/.claude/skills/`: 10k (still at the cap), 75 with no description;
  - after `SLASH_COMMAND_TOOL_CHAR_BUDGET=80000`: Skills 16.8k (1.7%), none with no description, locally and in a new
    cloud session (the variable set in the default cloud environment).
  A synced plugin disabled only with `claude plugin disable <name>@synced` still listed its skills; turning it off on
  claude.ai (Customize, Plugins) removed them. The skill count stays at 34, so the profile README did not change.
- 2026-10-18: M5 retrospective, M8 safe-merge and evaluator, M9 improve-codebase-architecture, M10 which-skill, M11
  small additions with the new `suppression-reason` hook, P1.2 validate in CI and P1.3 (a checklist line, by the
  owner's choice), merged as [pull request 21](https://github.com/paureis/pau-skills/pull/21). Five builders in
  parallel, each brief checked by a read-only subagent first; every item had a fresh reviewer, one fix round and a
  second look, and M5, M8, M9 and M11 had cold runs as headless sessions. Reviewers found a must-fix or serious finding
  in every item. The 10 changed skills were zipped with `pack-skills --since 7e06226` and sent to the owner; all
  replace an existing skill, and the owner uploaded them to claude.ai. `pau-skills-hooks` went to 0.2.0 for the hook,
  and the owner updated it on their computers. The skill count stays at 34, so the
  profile README did not change. Follow-ups: P1.6 to P1.8.
- 2026-10-19: N8 overnight-run, N9 engineering-principles, P1.6 retrospective audit, P1.7 mutate.sh and Python
  bytecode, P1.8 evaluator evidence line, and two follow-ups the owner added mid-batch (the hillclimb log formula
  guard and the mutate.sh restore by content), merged as [pull request 24](https://github.com/paureis/pau-skills/pull/24).
  The owner raised the description total to 13,000 first. Five builders, each in its own worktree with a read-only
  plan check of its brief first; every item had a fresh reviewer, one fix round and a second look, and N8, N9 and P1
  had cold runs as headless sessions. Reviewers or cold runs found a must-fix in N8 (a turn could rewrite its own
  predicate; the morning audit did not work end to end) and in the mutate.sh restore (it could erase a hidden edit).
  CI caught one macOS-only test failure, fixed before the merge. The 8 changed skills were zipped with
  `pack-skills --since 8f44afa` and sent to the owner as one bundle (2 new, 6 replacing); the owner uploaded them
  and all 8 were confirmed synced, identical to main. In a new session `/context` showed Skills at 14.5k tokens
  (1.5% of the 1M window, 92 skills listed) and none without a description. No hook changed. The profile README now
  says 36 skills.
- 2026-10-19: Q2 `geppetto` and the agent roster, Q5 html-plan links with Q9 a lighter `brainstorm`, Q6
  `launch-readiness` and Q7 UI states in `verify-app`, merged as [pull request 28](https://github.com/paureis/pau-skills/pull/28).
  The owner raised the description total to 14,000 and settled decision 9 first. Four builders, each in its own
  worktree with a read-only plan check of its brief first; every item had a fresh reviewer, a headless cold run with
  an empty HOME, one fix round and a second look. Reviewers found a must-fix in Q2, Q6 and Q7; the Q2 cold run ran
  the whole roster flow (install, `eng-lead` planning two slices, two builders in worktrees, two reviewers, branches
  ready to merge) for about $5. CI caught one macOS-only failure, fixed before the merge. The 8 changed skills were
  zipped with `pack-skills --since 7fd0230` and sent to the owner as one bundle with html-plan (3 new, 6 replacing),
  and this repository's `.claude/agents/` now holds the roster. No hook changed. The profile README now says 38
  skills.
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
