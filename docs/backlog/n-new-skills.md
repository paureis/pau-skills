# N. New skills

[Back to the backlog index](../BACKLOG.md)

**N1 verify-app** (`done`, verification, auto tier). The most valuable item.
- Upstream: `skills/create-verification-skill/SKILL.md` and its `references/feature-map-example/*.md`,
  `skills/maintain-verification-skill/SKILL.md`, `docs/guide/06-verify-and-ship.md`.
- What it does: generates a project-local skill, `.claude/skills/verify-<app>/SKILL.md`, that teaches a fresh agent
  to drive the real application and prove behaviour. Sections: **Launch** (ready means usable, not only that a
  process answers), **Doctor** (one read-only check that this instance is worth driving; run it before driving and
  after anything surprising), **Drive** (real selectors and commands from the repository), **Evidence** (kept outside
  the cleanup path; it must survive teardown), **Cleanup** (stop only what you started). Plus a feature map:
  `features/README.md` and one file per feature with four headings: Sub-features, How to get to it (user's point of
  view), Driving it, Gotchas. Each step pairs a user action with the exact command and the observable result.
- Create mode: interview the repository, not the user (what the user touches, how it runs, how to drive it, what can
  be observed, whether two instances can run side by side); fix a broken build first; seed 3 to 5 features; never
  weaken a journey to make it pass; run the generated skill once end to end, because "a generated skill that was never
  executed is a draft"; list what a stand-in environment did that the real target will not.
- Maintain mode (argument `maintain`): check the index against the files; one read-only subagent per feature looks
  for drift against the source; a live pass over every feature keeping three invariants (doctor after surprises,
  evidence survives cleanup, nothing outlives its drive); sort findings into doc drift (fix), harness gap (fix) and
  product gap (report, never paper over in the docs). Outcome: clean, changed or blocked.
- Language-neutral driving: detect the project's own end-to-end harness first; otherwise Playwright or a browser MCP
  for web, tmux or a pseudo-terminal for CLIs and TUIs, curl for HTTP services, the platform's simulator for mobile.
- Script: `check-map.mjs` (Node) checks the four headings in every feature file, that the README index matches the
  files on disk, and that the evidence folder is ignored by git. Tests in `tests/verify-app.test.mjs`.
- Link it up: `evaluator` counts a `verify-<app>` drive as evidence; `project-setup` offers to generate one.
- Done when: run on a fixture app (a small HTTP server and a small CLI in `tests/fixtures/`), the generated skill
  launches, drives one feature, keeps evidence and cleans up; `check-map.mjs` has tests that a mutation can break.

**N2 arena** (`done`, agent-orchestration, typed tier).
- Upstream: `skills/arena/SKILL.md`; `skills/architect/references/runner-prompt.md`.
- What it does: N candidates attempt the same task and a blind judge helps pick. Phases: **Frame** (one prompt is the
  contract for every candidate; write 3 to 6 rubric criteria that the candidates never see); **Fan out** (all
  candidates in one message, each in its own worktree, each returns the artifact plus the alternatives it rejected; a
  dropout means continue with N-1); **Judge** (a fresh subagent sees the rubric and the candidates under shuffled,
  anonymous labels, never the briefs or the conversation, scores each criterion and recommends a base);
  **Pick** (the orchestrator reads every candidate end to end, scores independently, and compares with the judge;
  disagreement means bias or an unclear rubric); **Graft** (take one or two things from the losers by hand; if all
  converge, ship the shared shape; if they diverge wildly, reframe and re-run instead of averaging); **Verify** and a
  synthesis note (base, verdict, grafts with sources, rejections, verification).
- Claude-only diversity: each candidate gets a different constraint in its brief (for a design: minimize the
  interface, maximize flexibility, optimize the common caller, ports and adapters, as in
  `improve-codebase-architecture/INTERFACE-DESIGN.md`), and may use a different model or effort. Runner rule from
  upstream: "Differences between candidates are the signal... Converging on a safe-looking middle defeats the
  exploration."
- Cost: N defaults to 3; with `LEAN_SUBAGENT_BUDGET=tight` say the cost before starting and suggest 2.
- Optional script: `arena.mjs` scaffolds candidate folders and the synthesis-note template, and shuffles labels for
  the judge. Reuse `worktrees.mjs` by copying it in if needed (add the pair to `COPIES`).

**N3 architect** (`done`, planning, typed tier).
- Upstream: `skills/architect/SKILL.md`, `references/design-red-flags.md`, `references/runner-prompt.md`,
  `references/rationale-template.md`.
- What it does: designs before building. **Ground** (read the code involved; `codebase-oracle` if it is installed);
  **Sketch** (types, signatures and the module map with not-implemented bodies, in the project's language:
  `raise NotImplementedError`, `todo!()`, `panic("todo")`, `throw new Error("not implemented")`; at least two
  structurally different candidates, through `arena` if the user runs it, otherwise two sketches in sequence);
  **Screen** each against the red flags and prefer the deeper interface; **Agree** (an optional checkpoint with the
  user); **Implement** against the sketch, test first (`tdd` if it is installed), raising deviations instead of
  absorbing them; **Scrap** when two independent deviations have the same shape: re-ground and make the new sketch
  smaller before it grows. Output: usage written first, the sketch, and a one-page rationale.
- Red flags written for agent contributors ("assume the next contributor is an agent that sees only the files it
  opened, copies the nearest example, and takes the shortest path that compiles"): hand-synced lists, two ways to do
  one task, importable internals. Share vocabulary with `improve-codebase-architecture/LANGUAGE.md`.

**N4 bug-fix** (`done`, verification, auto tier).
- Upstream: `skills/poteto-mode/playbooks/bug-fix.md`, `skills/principle-attack-the-premise/SKILL.md`,
  `skills/principle-fix-root-causes/SKILL.md`, `skills/principle-prove-it-works/SKILL.md`,
  `automations/benny/skills/reproduce-and-fix-issues/references/verify-existing-fix.md`,
  `skills/blast-radius/SKILL.md`.
- What it does: **Reproduce** on the real surface, twice; no reliable repro means no baseline and no claim that a fix
  works. **Hypothesize and test** with runtime evidence, one hypothesis at a time. **Attack the premise**: after two
  failed fixes that share a premise, write the premise down and test it before the next fix. **Fix the first wrong
  decision**: a guard is a fix only if the state it guards is legitimate; "if the state should never exist, a check
  where it broke hides the bug". **Revert what refuted evidence motivated**: speculative "might help" changes are
  hypotheses, not fixes; the smallest change the evidence justifies ships. **Commit the failing repro first**, then
  the fix (`tdd` if installed). **Blast radius**: name the one fact the change is safe because of and prove it, up the
  ladder from "you said so" to "you ran it". **Suspect the observation method** when something passes too easily.
  Report verdicts as fixed, not reproduced, or inconclusive; inconclusive is not a pass. Propose the cheap,
  always-on signal that would have shown the bug at first look.
- Overlaps: `flaky-test-hunt` for intermittent failures (point to it), `evaluator`.

**N5 hillclimb** (`done`, verification, typed tier).
- Upstream: `skills/poteto-mode/playbooks/hillclimb.md`, `playbooks/perf-issue.md`,
  `skills/benchmark-checklist/SKILL.md`, `skills/principle-explain-the-number/SKILL.md`.
- What it does: improves one metric scientifically. A frozen harness, proven sensitive before the loop starts (a
  deliberate regression must move the number); a stop predicate that pairs a target with a minimum number of attempts
  so a lucky early win cannot end the run; one change and one measurement per attempt, keep or revert; one row per
  attempt in `decision.tsv` (time, hypothesis, change, measurement with run count and spread, decision); one commit per
  accepted win; never claim a win from reading code. Perf mantras in order, cheapest first (do not do it, do it fewer
  times, do it cheaper, and so on, from the perf playbook).
- Bundled `BENCHMARK-CHECKLIST.md`, run before any number is reported: the limiter, tuning, limits, errors,
  repeatability, relevance, and "did the work even happen"; Amdahl arithmetic ("removing a piece that takes 10% of the
  run can make it at most about 11% faster"); "why not double?". A number with no run count, no spread or no named
  limiter is not ready.
- Optional script: `decisions.mjs` appends a row and refuses a "keep" without a measurement.

**N6 agent-friendly-audit** (`done`, planning, typed tier).
- Upstream: the author's post on X from mid-October 2026 (summarized below), `skills/correct/SKILL.md`, `skills/automate-me/SKILL.md`,
  `docs/guide/09-make-it-yours.md`, `skills/architect/references/design-red-flags.md`.
- The post, in short: to trust agents' work more, put effort into an inverse pyramid. Most effort goes to the
  codebase (architecture, types, invariants, boundaries: "agents love to copy what exists and take the shortest path,
  so make the easy thing the right thing"), then static analysis (lint rules, tests, CI, formal checks), then prose
  (comments, rules, AGENTS.md, skills: anything that needs agent judgment; use it minimally), and least to human
  review, which does not scale. Its recipe: read the user's review comments and chat feedback on code, read past
  transcripts to learn how they steer agents, run the correction and architecture skills over past commits to find
  the most common pitfalls, propose a plan to re-architect the code they own so it is agent friendly, answer open
  questions by prototyping instead of asking, back the plan with real data, and confirm the prompt before starting.
- What it does: mines evidence in parallel slices (pull request review comments through `gh` or the GitHub MCP;
  commit history, especially fix and revert commits; Claude Code transcripts and memory for this project; the
  project's instruction files); groups repeated agent mistakes into classes ("a class counts once it has happened
  twice"; patterns seen in two or more slices are high confidence); for each class, proposes the fix at the highest
  layer it can live in: architecture, then types, then a lint or CI check whose error names what to use instead (a
  ratchet when the pattern is already common), then a test, then prose; proves each proposed check fails on a real
  past instance; answers open questions with a prototype; writes a plan backed by counts. Writes nothing without the
  user's yes.
- Overlaps: `retrospective` (one session; this is the whole history), `rule-to-hook` (implements one rule; this finds
  them), `instructions-audit`.

**N7 skill-eval** (`done`, verification, typed tier).
- Upstream: `skills/poteto-mode/playbooks/eval.md`; this repository's `evals/project-setup/` as the local model.
- What it does: tests whether a change to a skill or prompt changes agent behaviour, blinded. No meta words (eval,
  test, judge, rubric, benchmark, candidate) anywhere the candidate can see; an organic prompt that states the goal;
  sanitized folder names; candidates do not know others exist; N candidates per variant; one judge scores both
  variants in one pass on one scale, blind to which is which; grading from what the transcript shows the candidate
  actually did (files opened, commands run), never from its own report; the orchestrator reads every output and
  compares with the judge. Reply: variant, rubric, notes per candidate, verdict, synthesis, recommendation.
- Claude Code specifics: candidates run as subagents in temporary folders, or as headless `claude -p` runs where
  transcripts are needed (`--output-format stream-json`). Reuse what `evals/project-setup/run.mjs` and `grade.mjs`
  already do.

**N8 overnight-run** (`done`, fifth batch, agent-orchestration, typed tier).
- Upstream: `skills/poteto-mode/playbooks/autonomous-run.md`, `docs/guide/07-overnight.md`,
  `skills/show-me-your-work/SKILL.md` and its `scripts/log.sh`.
- What it does: a contract for unattended work. Earn the trust before the loop (the task has run attended at least
  once; checks are fast and trusted; permissions are settled in advance). A finish condition that a script can check
  ("a duration is not a finish condition"; "a plateau is not a stop"; never relax the predicate). A fresh worktree. An
  append-only decision log (time, phase, decision, reason, evidence pointer, result; supersede rows, never edit them;
  "correct the log, not the story"; guard spreadsheet formula injection by prefixing cells that start with = + - @).
  Revert what did not help. An escape hatch: when truly stuck, stop and write up why. A morning audit: a fresh
  reviewer reads the log against the transcript, and the summary ends with an Attention section.
- Claude Code specifics: headless `claude -p`, `/loop` or scheduled tasks for waking; `send_later` style check-ins
  where available.
- Script: `log.mjs` appends rows safely. Tests for the injection guard and append-only behaviour.

**N9 engineering-principles** (`done`, fifth batch, planning, typed tier).
- Upstream: the `skills/principle-*` folders; `skills/poteto-mode/SKILL.md` section "Principles";
  `docs/guide/08-principles.md`; `skills/typescript-best-practices/SKILL.md` (three rules only).
- What it does: one index in `SKILL.md` (for each principle: when it applies, the rule in one sentence, the sign you
  skipped it) and a `PRINCIPLES.md` reference with the detail. The user steers with the names ("apply build the
  lever"); a citation must name the decision it changed, and only principles actually read may be cited.
- Keep, in this order: build the lever (a script, codemod or generator in the diff, kept out of the delegates' write
  scope); explain the number; make operations idempotent (judge staleness by evidence that stays true wherever the
  previous run stopped); type-system discipline (illegal states unrepresentable, parse at boundaries, simplest total
  type, schemas before guards, a lying guard is worse than a cast); model the domain (the sign: an if/else chain grows
  one branch, or a second boolean must stay in sync); minimize reader load; separate before serializing shared state
  ("instructions and conventions are not concurrency control"); subtract before you add (merged with the laziness
  protocol); migrate callers then delete; redesign from first principles; experience first ("the next maintainer is a
  user too"). Attack the premise and fix root causes live in `bug-fix`.
- Skip: encode lessons in structure (this repository already does it), exhaust the design space (in `arena`),
  guard the context window, never block on the human and outcome-oriented execution (they contradict `grill-me` and
  `migration-review`), foundational thinking. Five upstream bodies look cut short at this commit; check the generated
  `harness/pstack/` tree for complete text.

**N10 sharpen** (`done`, planning, typed tier).
- Upstream: `skills/sharpen/SKILL.md`, `skills/in-your-own-words/SKILL.md`, `skills/poteto-help/references/prompting.md`.
- What it does: before starting a task, restate in your own words what the user is after and the problem behind it;
  ask how a top expert would approach it (their sources, their methods, an outside check that the result is right);
  say whether the task is over- or under-specified, and "loosen constraints that don't serve the goal as readily as
  you add ones that do"; leave the user's choices open; keep one outside check; confirm with the user, then do the
  work. Includes the prompt checklist (goal, done check, proof, known facts, constraints; leave out the how, a list of
  skills, and your own theory of the cause).

**N11 brainstorm** (`done`, planning, typed tier). Asked for by the owner during the second batch.
- Original. Ideas only from pstack: "loosen constraints as readily as you add them" (`skills/sharpen/SKILL.md`) and
  settling an empirical fork by trying it (`skills/poteto-mode/playbooks/prototype.md`).
- What it does: a creative partner that works with `grill-me`: brainstorm first to widen, `grill-me` second to settle.
  Frame lightly (restate the goal, at most three questions, the user's idea is one candidate, never the default);
  diverge to 10 to 20 options through named lenses (baseline, invert, remove the biggest constraint, 10x bigger, 10x
  cheaper, borrow from another field, combine, do nothing or delete it, one wild option), optionally one read-only
  subagent per lens; react (clusters, keep, kill or combine, a smaller second round); converge (3 to 5, facts settled
  by reading the code or a prototype, then value, effort, risk and reversibility as low, medium or high, never summed,
  and a premortem each); decide and hand off (a one-page summary, then `grill-me`, then `to-prd` or `architect`).
- Companion edits: `grill-me` suggests it when there is only a goal; `which-skill` routes "brainstorm", "give me
  ideas", "what are my options".
