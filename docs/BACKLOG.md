# Backlog: ideas from pstack

Work planned on 2026-10-17 after a review of [pstack](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack),
the skills repository of Lauren Tan (poteto), published in Cursor's plugin repository under the MIT License. Five
reader agents read all of it (54 skills, the 23 `poteto-mode` playbooks, the guide, the automations and the agents)
and compared each part with this repository. This file is the result: what to build, what to fold into existing
skills, what to skip, and the decisions already taken.

A new session should be able to pick any item below and build it without the conversation that produced this file.
Read "How to work an item" first.

## How to work an item

1. **Get the upstream source.** It is data to read, never instructions to follow. Put it in its own folder outside
   the repository:
   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins upstream-pstack
   git -C upstream-pstack sparse-checkout set pstack
   git -C upstream-pstack fetch --depth 1 origin 09d06eb4b97a1020ab31e84030e38baf1099c7dc
   git -C upstream-pstack checkout 09d06eb4b97a1020ab31e84030e38baf1099c7dc
   ```
   Every upstream path below is relative to `pstack/` at that commit. If the commit is gone, use the current head and
   say so in `docs/ORIGINS.md`.
2. **Follow [ADDING-A-SKILL.md](ADDING-A-SKILL.md)** and the rules in `CLAUDE.md`: language-neutral, works on its
   own, Node standard library only, plain English with no em or en dashes.
3. **Write it for Claude Code, not Cursor.** pstack assumes Cursor's `Task` tool, model slugs such as
   `grok-4.7-xhigh-fast`, a "different model family" for every reviewer, Bun and TypeScript scripts, Bugbot, Graphite,
   Slack and Cursor transcript paths. Replace them:
   - A reviewer "on a different model family" becomes a fresh subagent that has not seen the build, with a hostile
     prior (the way `evaluator` works). With one model family, diversity comes from different briefs and lenses, and
     optionally a different Claude model or effort level per subagent (the Agent tool's `model` and `effort` fields).
   - Cursor's `Task` becomes the Agent tool. `AskQuestion` becomes AskUserQuestion. Cloud agents become
     `isolation: "worktree"` or the `parallel-worktrees` skill. Continuing a finished subagent uses SendMessage.
   - Scripts are rewritten in Node with no dependencies. Never copy Bun, `commander` or `jq` usage.
   - A mention of another pstack skill becomes either our equivalent ("if it is installed") or an inline fallback.
4. **Attribution.** pstack is MIT, copyright 2026 Lauren Tan. When text or structure comes from it:
   - add the file to `NOTICE` under a pstack section with the upstream license (see item P0.3);
   - add `license: MIT (adapted from cursor/plugins pstack; see NOTICE)` and `metadata.upstream: <upstream URL>` to
     the frontmatter;
   - mark it "(Adapted from ...)" in `docs/ORIGINS.md`, with a "What this version changes" list taken from a real
     diff against the upstream file, and "(adapted)" in the README.
   A skill that only takes an idea, with no shared text or structure, is Original; say in ORIGINS which upstream idea
   it came from.
5. **Set its invocation tier** from "Context budget" below, and keep its description inside the limits there.
6. **Prove it.** `npm test`, `npm run scrub`, `node scripts/build-marketplace.mjs --check`,
   `claude plugin validate . --strict`, and a mutation run through `mutate.sh` for every new script test. Where the
   skill is a process with no script, run it once on a real or fixture repository and keep the transcript summary for
   the PR.
7. **Update this file**: move the item to "Done" with the PR link.

## How to run a batch

The first batch (P0.2 to P0.4, N1 to N4, merged as pull request 6) was run this way, and it worked. Repeat it. One
session is the orchestrator; it follows `lean-subagent-dev` (type `/lean-subagent-dev` at the start) and builds
nothing itself except the integration.

1. **Pick 3 or 4 items** that touch different files. New skills run well in parallel; items in section M edit
   existing skills and shared files, so run those one at a time or give each a disjoint set of files.
2. **One git worktree per builder**, all from the same commit of the working branch:
   `git worktree add -b par/<batch>/<item> ../pau-skills-wt/<item> <base>` (a sibling folder, outside the checkout). Get the upstream source once into the
   scratchpad (step 1 of "How to work an item") and give every builder its path.
3. **Brief each builder** with the fields of `skills/agent-orchestration/lean-subagent-dev/BRIEF-TEMPLATE.md`: the
   goal and its backlog item, the worktree, the files it may create, the files it must not touch, the rules that
   apply (tier, attribution, standalone, language-neutral, no dashes, Node standard library), what done means
   (`npm test`, `npm run scrub`, `node scripts/build-marketplace.mjs --check`, `claude plugin validate . --strict`,
   mutations through `mutate.sh` after committing, and a dry run on a real or fixture target), when to stop and
   report, "commit, never push", and a fixed report format. Ask the report for the drafts of everything the builder
   may not write: the README bullet, the ORIGINS section (from a real `git diff --no-index` against upstream, with a
   shared-text estimate), the NOTICE file list, the `which-skill` line, any `COPIES` entry, and "anything I was unsure
   about". Launch all builders in one message, in the background.
4. **The orchestrator owns the shared files**: `README.md`, `docs/ORIGINS.md`, `NOTICE`, `CHANGELOG.md`,
   `.claude-plugin/marketplace.json`, `skills/session-discipline/which-skill/SKILL.md`, the plugin READMEs,
   `tests/standalone.test.mjs` and this file. Builders never touch them and never run `scripts/new-skill.mjs`, which
   edits them. Save each report's drafts to a notes file in the scratchpad as it arrives, so they survive a context
   summary.
5. **When a builder reports**: read its diff, rerun the checks in its worktree yourself, then launch one fresh
   reviewer with the reviewer prompt at the end of `skills/verification/review-triage/TRIAGE.md`, pointed at the
   worktree, the diff range and the backlog item. For a skill that generates or drives something (as `verify-app`
   does), also launch a cold run: a fresh agent that follows the skill literally on a fixture and lists every place
   the instructions failed. In the first batch the cold run found problems the reviewer missed.
6. **Triage every finding** with `TRIAGE.md`, then send one fix round back to the same builder (SendMessage keeps its
   context), with each finding numbered and "test first" for script items. After it reports, give the fix a second
   look yourself, on the fix only, and try the riskiest fix by hand. Then stop: anything new goes to an issue or to
   the owner.
7. **Merge** each finished branch into the working branch with `git merge --no-ff`, one at a time, and run the full
   suite after each merge.
8. **Integrate** once, after the last merge: README (the reference bullets, the problem lists, the skill badge, the
   tier lists), ORIGINS, NOTICE, `which-skill`, `evaluator` or other links the items ask for, plugin READMEs and
   descriptions, minor version bumps for every plugin whose files changed and for the bundle, CHANGELOG, and the
   statuses here. Run all four checks, commit, push, and open one pull request that says how each item was built
   and checked and what the owner must decide.
9. **Clean up** the worktrees and `par/` branches after checking each is clean and fully merged
   (`git worktree remove`, `git branch -d`). After the owner merges, update the skill count on the profile README in
   `paureis/paureis` (the `pau-skills` line).
10. **Ship to the owner's account.** The owner gets every skill through their claude.ai account (it syncs to the
    terminal, the desktop app and the web) and the hooks through the `pau-skills-hooks` plugin, never the full
    plugin. So a batch is not finished at the merge:
    - Build one zip per new or changed skill from main, with the skill's folder at the zip root (`<name>/SKILL.md`
      and every bundled file). Use `scripts/pack-skills.mjs` once item P1.1 exists. Send the zips to the owner and say
      which are new and which replace an existing skill.
    - Before sending, the upload rules must hold; the tests enforce both: no XML-like tag in a description (claude.ai
      refuses `<word>`), and no "claude" or "anthropic" in a name.
    - The owner uploads them on claude.ai (Customize, Skills; open an existing skill to replace it). Then, in a new
      session, check that each one synced with all its files: `ls ~/.claude/skills/synced/*/<name>/`. A session only
      sees skills uploaded before it started.
    - When any hook changed, bump `pau-skills-hooks` too, and tell the owner to run
      `claude plugin marketplace update pau-skills` and `claude plugin update pau-skills-hooks@pau-skills` on each
      computer.

Things that bit the first batch:
- Subagents cannot launch subagents. A builder that needs "a fresh agent" for a dry run uses a separate `claude -p`
  process, or reports the step as not done; the orchestrator can run the cold run instead.
- Each Bash call is a fresh shell: variables do not survive between calls, and `$!` after `cd dir && cmd &` is the
  subshell, not the app. Skills that start processes must save state to a file and record the real process ID.
- Reviewers found real bugs in every item, including leaks in arena's blind judging and cleanup that could kill
  processes it did not start. Do not skip the review because the builder's own checks passed.
- The auto tier is full (12 skills, 4,448 of 4,500 characters). Every item left in this file is typed tier, so the
  limit does not block anything planned.

## Decisions taken (2026-10-17)

1. **Tests.** Adopt pstack's position: prefer no new test over a bad test. Add its two-edit check to `tdd`: a test
   is kept when it fails if the behaviour breaks and still passes if only the internals change. `mutation-test` stays
   the scripted way to run the first edit. (Item M1.)
2. **Principles.** One `engineering-principles` skill with an index and a reference file, not one skill per
   principle. (Item N9.)
3. **Writing style.** Keep this repository's rules (commas, colons, periods or parentheses instead of dashes). Add
   pstack's list of words and phrases typical of AI text to the style test. Do not adopt its bans on parentheses,
   mid-sentence colons or semicolons. (Item P0.4.)
4. **Context cost.** Every skill description loaded into every session costs context, so skills are split into two
   tiers and a test enforces the limits. (Item P0.2.)
5. **`project-setup` stays standalone.** It does not offer to generate a verification skill: `verify-app` is in the
   auto tier, so the agent reaches for it when a change needs proving in the running app.
6. **Shortened auto descriptions stay as they are.** The most used trigger phrases of `migration-review` were
   restored; restoring more would cost characters from another auto skill for little gain.

## Context budget

Facts (Claude Code documentation, skills page, checked 2026-10-17):
- The skill listing gets about 1% of the context window: about 2,000 tokens, roughly 8,000 characters, on a 200k
  window. Each description is capped at 1,536 characters. When the listing is over budget, Claude Code drops the
  descriptions of the least used skills; their names stay.
- `disable-model-invocation: true` removes the description from the model's context. The skill then costs nothing
  until the user types `/name`, and the model cannot start it on its own.
- On 2026-10-17 the 25 skills here were all model-invocable and their descriptions totalled about 15,000
  characters, already over the budget of a 200k window.

**Policy.**
- **Auto tier** (the model may start it): skills an agent should reach for without being asked, because the user
  would not know to type them at that moment. At most 12 skills, each description at most 400 characters, all auto
  descriptions together at most 4,500 characters.
  The auto tier: `which-skill`, `tdd`, `bug-fix`, `verify-app`, `review-triage`, `evaluator`, `mutation-test`,
  `codebase-oracle`, `migration-review`, `flaky-test-hunt`, `dependency-security-audit`, `safe-merge`
  (`merge-guard` sends the agent to it).
- **Typed tier** (`disable-model-invocation: true`): modes, rituals and heavy workflows the user starts on purpose.
  Everything else, including `project-setup`, `session-close`, `handoff`, `retrospective`, `instructions-audit`,
  `lean-subagent-dev`, `methodology`, `parallel-worktrees`, `grill-me`, `to-prd`, `to-issues`,
  `improve-codebase-architecture`, `ci-cost-and-cadence`, `dependency-upgrade`, `rule-to-hook`, and every new skill
  not named in the auto tier.
- A skill in the typed tier cannot be started by another skill. Where a skill says "run X if it is installed" and X is
  typed, it says "suggest the user run `/X`" instead, or reads X's bundled file directly when it carries a copy.
- The README says which skills load on their own and which you type.

## Work items

Status: `todo`, `in progress`, `done`. Plugin and tier are where the skill goes. "Upstream" lists the files to read.

### P0. Groundwork (do first)

**P0.1 Backlog** (`done` with this file).

**P0.2 Context budget** (`done`, orchestrator, touches every skill).
- Add `disable-model-invocation: true` to every typed-tier skill and shorten auto-tier descriptions to the limits.
- Add `tests/context-budget.test.mjs`: counts auto-tier skills (12 at most), checks each auto description is at most
  400 characters and the total at most 4,500, and that every skill still has a description (the `/` menu shows it).
- Rewrite mentions in skills that call a typed skill (see the policy).
- README: a short "What loads on its own" section with the two lists; `which-skill`: the same split.
- Version bump: minor for every plugin (behaviour changes).

**P0.3 NOTICE** (`done`). Fix the stale paths (`plugins/<p>/skills/<s>` should be `skills/<p>/<s>`). Add a pstack
section with the MIT text, copyright 2026 Lauren Tan, listing adapted files as they land.

**P0.4 Style word list** (`done`). Extend `tests/style.test.mjs` with the lexical rules of upstream
`skills/unslop/SKILL.md` (AI vocabulary such as delve, pivotal, tapestry, seamless, leverage as a verb; "serves as";
"not just X but Y"; chatbot phrases; filler), skipping code blocks and inline code. Check `evals/project-setup/grade.mjs`
for regexes to reuse. Keep this repository's punctuation rules. Fix whatever the new rules find.

### N. New skills

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

**N5 hillclimb** (`todo`, verification, typed tier).
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

**N6 agent-friendly-audit** (`todo`, planning, typed tier).
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

**N7 skill-eval** (`todo`, verification, typed tier).
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

**N8 overnight-run** (`todo`, agent-orchestration, typed tier).
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

**N9 engineering-principles** (`todo`, planning, typed tier).
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

**N10 sharpen** (`todo`, planning, typed tier).
- Upstream: `skills/sharpen/SKILL.md`, `skills/in-your-own-words/SKILL.md`, `skills/poteto-help/references/prompting.md`.
- What it does: before starting a task, restate in your own words what the user is after and the problem behind it;
  ask how a top expert would approach it (their sources, their methods, an outside check that the result is right);
  say whether the task is over- or under-specified, and "loosen constraints that don't serve the goal as readily as
  you add ones that do"; leave the user's choices open; keep one outside check; confirm with the user, then do the
  work. Includes the prompt checklist (goal, done check, proof, known facts, constraints; leave out the how, a list of
  skills, and your own theory of the cause).

### M. Changes to existing skills

**M1 tdd** (`todo`). Upstream: `skills/tdd/SKILL.md`, `skills/principle-test-behavior-not-implementation/SKILL.md`,
`skills/principle-sequence-verifiable-units/SKILL.md`. Replace "no test is too small" with "prefer no new test over
a bad test" and its list (mostly tests mocks, encodes implementation details, depends on timing or unrelated global
state, needs expensive infrastructure for a small fix, would be deleted right after proving the fix). Do not build a
test path from scratch only to satisfy the workflow; say what evidence replaces it. Add the two-edit check (break the
behaviour: the test must fail; change the internals: the test must pass), pointing at `mutation-test` for the first
edit. Expected values come from the requirement, not from a run of the code; an exact error message pins wording no
caller reads. Revisit the rule that checking the database directly is a bad test: a stored value read back is
behaviour.

**M2 rule-to-hook** (`todo`). Upstream: `skills/correct/SKILL.md`, `docs/guide/09-make-it-yours.md`. Add the fix
order (architecture, types, lint or CI check, test, prose), the ratchet for patterns already common ("fail only when
a change adds more"), lint errors that name what to use instead, a rule table pairing each rule with its enforcer,
and exceptions with a reason, an expiry and a human's approval. Prove each new check on a real past mistake when one
exists.

**M3 mutation-test** (`todo`). Prefer a real past mistake from git history as the mutation when one exists. Add an
optional second check from the two-edit test: a pure refactor of the internals must leave the test green.

**M4 review-triage** (`todo`, keep both `TRIAGE.md` copies identical). Upstream:
`skills/interrogate/references/lead-judgment.md`, `skills/poteto-mode/references/bugbot-triage.md`. Add "nitpick
gravity" (if a reviewer's findings are all nits and preferences, the code is probably fine; say so), "I would have
done it differently" as the most common false positive, and a learned-pattern format for recurring findings
(confidence: candidate, recurring, strong; skip when; do not skip when).

**M5 retrospective** (`todo`). Upstream: `skills/reflect/references/synthesizer.md`,
`references/divergent-reviewer.md`. Gate each proposed edit on "decision-changing: a future agent does something
different because of the edit, not just reads more text". Add a lens for "decisions that worked but for the wrong
reasons".

**M6 lean-subagent-dev** (`todo`, keep both copies of shared files identical). Upstream:
`skills/setup-pstack/SKILL.md`, `skills/poteto-mode/playbooks/orchestrate.md`. Add an effort level per role (builder,
plan checker, reviewer) to the budget table through the Agent tool's `effort` field; never name a model that has not
been confirmed available; refuse to launch a subagent while a brief field is empty; never resume a subagent only to
check on it, judge by side effects; standing orders pasted into every brief.

**M7 codebase-oracle** (`todo`). Upstream: `skills/why/references/epistemics.md`, `skills/how/SKILL.md`,
`skills/how/references/*.md`. Replace the three answer buckets with five tiers (direct, supported, inferred,
speculative, unknown) and the phrasing each allows; "never cite code as evidence for its own intent"; treat the
user's guess as one candidate among others. For big questions, 2 to 4 explorers on separate angles, then one
explainer; answer format Overview, Key concepts, How it works, Where things live, Gotchas. History questions through
git and `gh` first.

**M8 safe-merge and evaluator** (`todo`). Upstream: `skills/poteto-mode/playbooks/shipping.md`,
`docs/guide/06-verify-and-ship.md`. A verdict covers a patch: compare `git patch-id` at the verdict commit with the
current head before trusting an older verdict after a rebase. Evaluator: evidence by change type (a CLI change runs
the real command, a parser or migration replays a saved input, a storage change reads the value back) and
"inconclusive" when a check could not run.

**M9 improve-codebase-architecture** (`todo`). Upstream: `skills/architect/references/design-red-flags.md`,
`skills/principle-minimize-reader-load/SKILL.md`, `skills/principle-model-the-domain/SKILL.md`,
`skills/poteto-mode/playbooks/refactoring.md`. Add the agent-contributor red flags, the reader-load test, the
model-the-domain signs, and for execution: pin behaviour with a characterization test first ("type check and lint
are not a pin"), migrate callers and delete in one wave.

**M10 which-skill** (`todo`). Upstream: `skills/poteto-help/SKILL.md` and `references/`. A "fix a run that went
wrong" symptom table; check state only when it changes the answer; when a skill is missing from the router's table,
read its frontmatter and route by its description; the prompt checklist (or point to `sharpen`).

**M11 small additions** (`todo`).
- `methodology`: "a plateau is not a stop"; never relax a finish predicate; an append-only decision log.
- `parallel-worktrees`: a "race" shape with the selection rule declared before spawning; "instructions and
  conventions are not concurrency control"; a cleanup audit's bucket is advice, not permission.
- `handoff`: when resuming, treat the previous trail as the record and do not redo work, then verify inherited claims
  on the artifact.
- `ci-cost-and-cadence` or `flaky-test-hunt`: classify a CI failure before retrying: one retry only; an identical
  second failure is not a flake; a failure in code the diff never touches suggests a stale base
  (`git merge-base --is-ancestor`).
- A possible hook: report newly added lint suppressions that carry no reason (`eslint-disable`, `@ts-ignore`,
  `# noqa`, `# type: ignore`, `//nolint`, `#[allow(`, `@SuppressWarnings`), from upstream `skills/no-comments`.

### Skipped, and why

- `poteto-mode` as a whole: a 42,000-word router over 23 playbooks built for Cursor, Grok and large agent fleets.
  Its best playbooks become N4, N5, N7 and N8; `which-skill` and `lean-subagent-dev` cover the router.
- `recall`, `setup-pstack`, `make-bot-ui`, the `benny` automations, `docs/harness`: tied to Cursor transcripts,
  Cursor model rules, Cursor Automations or Slack.
- `typescript-best-practices`: language-specific; three rules go into N9.
- `interrogate`, `how`, `why`, `swarm`, `reflect`, `correct`, `show-me-your-work`, `benchmark-checklist`,
  `blast-radius`: their best parts are folded into the items above instead of becoming separate skills.
- `in-your-own-words`, `bro`, `ketchup`, `teach`, `figure-it-out`, `no-comments`, `unslop` as skills: too small, or
  covered by N10, P0.4 and M11.
- Playbooks `visual-parity`, `multi-phase-plan`, `pause-safely`, `runtime-forensics`, `trace-forensics`,
  `autopilot-*`, `opening-a-pr`: niche, overfit, or already covered.

## Order

1. Done: P0.2, P0.3, P0.4 (groundwork).
2. Done: N1 verify-app, N2 arena with N3 architect, N4 bug-fix.
3. **Next:** N5 hillclimb, N6 agent-friendly-audit with N10 sharpen, N7 skill-eval, and P1.1 pack-skills (four
   builders in parallel; P1.1 is small and its script makes step 10 of "How to run a batch" one command).
4. M1 to M11 (edits to existing skills; one at a time, or in disjoint groups, because they touch shared files).
   M1 (`tdd`) first: it carries a decision the owner already took.
5. N8 overnight-run, N9 engineering-principles.

When the batch is merged, update the skill count on the author's GitHub profile README (`paureis/paureis`).

### P1. Small tooling ideas

- **P1.1 pack-skills** (`todo`). The owner gets every skill through the claude.ai account (Customize, Skills, Upload
  a skill), so each changed skill has to be re-uploaded as a zip of its folder. A `scripts/pack-skills.mjs` (Node
  standard library; zip written with `zlib.deflateRawSync` and a small central directory) that writes
  `dist/<skill>.zip` for named skills, or for every skill changed since a git ref, would make that one command. Check
  the upload rules claude.ai enforces before writing: no XML-like tag in a description, no "claude" or "anthropic" in
  a name (both already tested).

## Done

- 2026-10-17: P0.1 this backlog.
- 2026-10-17: P0.2 context budget, P0.3 NOTICE, P0.4 style word list, N1 verify-app, N2 arena, N3 architect, N4
  bug-fix. Each was built by a subagent in its own worktree, checked by the orchestrator, reviewed by a fresh
  subagent, and fixed in one round (`verify-app` also had a cold run by a fresh agent). Not done from N1: the
  `project-setup` offer to generate a verification skill, because `project-setup` promises not to send beginners to
  other skills; decide whether to make an exception. The auto tier is now full (12 skills, about 50 characters left),
  so a new auto skill needs a description trimmed elsewhere.
