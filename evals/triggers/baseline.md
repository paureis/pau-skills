# The first trigger round (baseline)

Run on 2026-10-29 with Claude Code 2.1.312 and `claude-opus-5-5`, from a folder outside this repository: 38 skills,
190 requests (114 that should start their skill, 76 near misses), 2 repeats, 380 one-turn runs. It cost 34.10 US
dollars against an estimate of 30.40 and a cap of 40 (0.08 to 0.10 per run; one run cost 0.21, past its hard stop of
0.16, because Claude Code checks `--max-budget-usd` only after a turn). The parts of its summary are in
`baseline/`; pass that folder to `--baseline` to compare a later round.

## What it shows

- **No skill started where it should not.** Across all 380 runs no request started a wrong skill: 0 wrong starts for
  every skill, and no built-in skill started either. Every near miss came out right (152 of 152): the skill under
  test stayed quiet. Of the 124 near-miss runs that name another skill, 79 started that skill and 45 started nothing.
- **Hits: 175 of 228 runs (77 percent).** 20 skills hit 6 of 6. The misses are all "started nothing", never another
  skill.
- **Most misses may come from the one-turn limit.** Of the 53 misses, 41 ran a Bash command first (an `ls`,
  sometimes a `find` or a `grep`, of the empty folder) and would have had to start the skill in the second turn; 12 answered in text or did
  nothing. A miss after Bash says the agent wanted to look before choosing; it does not say the description failed.
- **The weakest skills** (hits of 6): `codebase-oracle` 0 and `parallel-worktrees` 0 (11 of their 12 misses after a look
  around), `bug-fix`, `lean-subagent-dev`, `sharpen` and `to-prd` 2, `arena`, `evaluator`, `overnight-run` and
  `retrospective` 3. `lean-subagent-dev`'s two longer requests and `sharpen`'s request 2 got a text answer with no
  tool in both repeats: the agent did the work in its reply instead of starting the skill.
- **Request 1 phrases that missed:** "arena this", "find the root cause", "answer these from the code", "evaluate
  this", "run these in parallel" (both repeats), and "security audit", "enforce this rule", "run this overnight" (one
  repeat each).
- **16 requests were unsteady** (the two repeats differed), most of them "none after Bash" in one repeat and a hit in
  the other.

## Near misses that started nothing in both repeats

These name a skill that did not start; the request may be too plain to need a skill, or the named skill's
description does not reach it: `agent-friendly-audit` n2 (retrospective), `architect` n2 (codebase-oracle), `arena` n2
(brainstorm), `brainstorm` n2 (to-prd), `ci-cost-and-cadence` n2 (hillclimb), `codebase-oracle` n1
(improve-codebase-architecture), `dependency-upgrade` n1 (dependency-security-audit), `flaky-test-hunt` n1 (bug-fix),
`grill-me` n2 (sharpen), `hillclimb` n1 (bug-fix), `lean-subagent-dev` n2 (arena), `migration-review` n2
(dependency-upgrade), `project-setup` n1 (instructions-audit), `session-close` n1 (handoff) and n2 (retrospective),
`skill-eval` n1 (arena), `to-issues` n1 (to-prd) and n2 (parallel-worktrees), `verify-app` n1 (evaluator).

## What to do with it

This batch measures only. A follow-up item can reword the descriptions of the weakest skills and run the round again
with `--baseline`. Before that, it is worth one cheap check of the one-turn limit: rerun only the 41 "after Bash"
misses with two turns, to see how many were real misses.
