# Origins

Where each piece came from, the problem that led to it, and, for the adapted ones, exactly what changed relative to
upstream. Most of these I wrote for my own projects first, and their stories are from those projects with the names
removed. Pieces whose "Changes for this release" says "written for this release" are new: they address failure modes
that are common in agent work, and their problem statements describe the failure in general terms rather than a
specific incident.

## How provenance was decided

Every skill was compared against the full git history of [mattpocock/skills](https://github.com/mattpocock/skills)
(493 commits, from 2026-02-03 to the 2026-09-29 head), not just its current version, because the upstream skills have
been renamed and rewritten since I copied them. For each of my files I found the closest upstream version by two
measures: shared normalized lines (LCS) and the share of my word 6-grams that appear in any upstream version of any
file. The change lists below come from `git diff --no-index` between my file and that closest version.

- **Original**: no meaningful shared text with any upstream version (under 1% of 6-grams).
- **Adapted**: shared structure or text, plus substantive changes of mine.
- **Abridged copy**: upstream text shortened, with no substantive additions. Treated like an unchanged copy: not
  published here, linked in the README instead.

After that comparison, every skill (adapted ones included) went through a punctuation pass that replaced em and en
dashes with commas, colons, periods or parentheses. It changed no instructions, so the classifications and change
lists below still hold.

---

## session-discipline

### retrospective (Original)

0 of 1198 word 6-grams appear in any upstream version, including upstream's later `retro` skill.

**Problem.** Retrospectives kept adding rules, and the rule files kept growing by restating themselves: the same lesson
written three ways in three places, until nobody read them. The skill's redundancy gate makes every proposed learning
pay for its place: score it against everything already written, and if it is a duplicate, the answer is to make the
existing rule enforceable, not to restate it. The scoring started as 3-shingle Jaccard; a control run scored a rule
that was already present nearly verbatim at 0.058, because a short proposal against a long unit is dominated by the
unit's size. It switched to bigram containment (intersection over the smaller set), which answers "how much of the new
text is already there". `--stale` was added after rules kept pointing at files and scripts that had been removed.

**Changes for this release.** The script's path is `${CLAUDE_PLUGIN_ROOT}`-relative; it also scans the project's
`.claude/skills`; `--home` lets tests point it at a fake home; the stale-path pattern covers common top-level folders
instead of one project's; dated "owner rule" notes were removed; one bullet was added to "Fixes in the rule itself"
(the third-time rule from `RULES.md`).

### session-close (Original)

Generalized from a project's session-close skill.

**Problem.** The loop I wanted was work, reflect, prepare the next session, as one command. Done by hand, steps got
skipped, the retrospective most often. The skill fixes the order and makes each skipped step say why. Two details come
from real failures: times are taken from the machine clock because a close once logged 02:40 of the next day for
22:40 (it read the UTC `Z` of an agent notification), and the handoff always names the models used so a silent model
change is noticed.

**Changes for this release.** Paths come from `.claude/roadmap.json` (shared with the roadmap hook) instead of fixed
project paths; project-specific checks (a linked cloud project, a CI skip script, named people to ask) became generic
steps ("if the project records a linked-environment invariant, check it").

### handoff (Original)

0 of 770 word 6-grams appear in any upstream version, including upstream's `handoff` and `claude-handoff`, which take
a different approach (a document in the OS temp directory, or a background agent).

**Problem.** Sessions end mid-work, and the next one has no context. The retrospective gate (Step 0) was added because
the retrospective was the step that got squeezed out between finishing the work and handing off, even when a written
rule required it. The approval gate lets the resumed session read and run read-only checks before asking.

**Changes for this release.** It names the plugin-qualified retrospective skill. Nothing else.

### Roadmap hook, `scripts/roadmap.mjs` (Original)

**Problem.** The roadmap is the only order of work: one item at a time, the next one starts only when the previous one
meets its definition of done, and blocked items are marked and skipped. Sessions that started from memory of the last
session drifted from that order. The hook prints the current item, the next pending one, the blocked ones and the open
questions at session start, so the order is in context before the first message.

**Changes for this release.** The original parsed fixed headers in another language and fixed paths. This version
reads paths, table headers, the status column name, status words and the "answered" pattern from
`.claude/roadmap.json`, finds columns by header name, and prints nothing when the project has no roadmap. The pure
`summarize()` function is exported for tests.


### claude-md-audit and `scan.mjs` (Original)

**Problem.** Instruction files such as CLAUDE.md and AGENTS.md grow by accretion: rules are restated in new words,
paths and commands go stale after refactors, and different files or tools end up contradicting each other. Every
always-loaded line costs tokens in every session, and vague or contradictory rules get ignored, which pushes people to
add louder rules instead of fewer, better ones. Nothing measured the whole set or checked it against the repository
as it is now.

**Changes for this release.** None; written for this release.

### which-skill (Original)

**Problem.** With more than twenty skills spread over five plugins, nobody remembers which one fits a situation, and a
skill that is never invoked does not help. The router maps situations to a starting skill and the next one or two,
and lists what the hooks already do without being asked.

**Changes for this release.** None; written for this release.

### Branch-context hook, `scripts/branch-context.mjs` (Original)

**Problem.** Agents assume a clean tree on a feature branch. They commit onto the default branch, build on a branch
that is far behind its upstream, or start new work in the middle of an unfinished rebase. All of it is visible with
a few read-only git commands that nobody runs first, so the hook runs them at session start.

**Changes for this release.** None; written for this release.

### Compact-snapshot hook, `scripts/compact-snapshot.mjs` (Original)

**Problem.** Compaction keeps the gist and drops the specifics: the user's exact words, the files already changed,
the open todo items. The agent resumes confident and slightly wrong. The hook writes those facts to a git-ignored
file before compaction and prints them when the compacted session starts, which is the moment they are needed.

**Changes for this release.** None; written for this release.

---

## verification

### mutation-test and `scripts/mutate.sh` (Original)

Merged from two harnesses I wrote in two projects.

**Problem.** "Mutation-verify every guard" was a rule, and doing it by hand kept lying in three ways. A restore with
`git checkout --` erased uncommitted work in the mutated file. On a Windows checkout, `sed -i` rewrote CRLF line
endings even when the expression matched nothing, so git reported the file modified and a no-op mutation read as
SURVIVED. And a mutation that applied but did not change behaviour (one that only appended `and true` to a SQL join)
looked like a weak test. The harness asserts each step instead of trusting it.

**What came from where.** From the first harness: the mutation on stdin as a sed script or a unified diff, the
control run, the check that a patch touches only the target file, exit codes 0/1/2, and restoring only the target
file. From the second: the content-hash "applied" check with carriage returns stripped, the label, and printing the
changed lines on SURVIVED. New here: `--sed` as an argument, running from any directory inside the repository,
refusing untracked files, and BSD `sed` support for macOS.

### evaluator (Original)

From the methodology kit's evaluator prompt (see `methodology` below).

**Problem.** An agent cannot certify its own work. In one project, an evaluator that had not seen how the code was
built found a security test that asserted its own mock, a module with zero coverage inside a green suite, and twelve
bypasses of a boundary gate the builder believed airtight. The prompt had to be pasted into a fresh chat; as a skill
it runs with `context: fork`, so it starts without the builder's conversation by construction.

**Changes for this release.** Converted from a paste-in prompt to a forked skill with `$ARGUMENTS` for the scope; it
points at `mutate.sh` for mutation checks; the notes for the human running it moved to the end.

### tdd (Adapted from [mattpocock/skills `tdd`](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd))

Closest upstream: `skills/engineering/tdd`, versions from 2026-02-04 to 2026-04-28. About 16% of my `SKILL.md`
6-grams are upstream text; `tests.md` is about 70% upstream; `mocking.md` shares none.

**What this version changes.**
- `SKILL.md` keeps upstream's Philosophy section and the horizontal-slices anti-pattern, and replaces the rest:
  - a "Before You Start" section (find the test runner and run it, match existing test patterns, identify the public
    interface);
  - a per-slice sequence, including "if it passes immediately, the behavior exists or the test is wrong" and "run all
    tests, not just the new one";
  - "What to test" and "What NOT to test" lists (private methods, call counts, framework behavior);
  - mocking rules inline (mock at seams, one adapter means do not mock, two adapters is a real seam, never mock what
    you own);
  - a refactoring section and a closing rules list.
  - Removed: upstream's planning checklist and its links to `deep-modules.md`, `interface-design.md` and
    `refactoring.md`, which are not part of this skill.
- `mocking.md` is rewritten: when and when not to mock, the shape of a good mock (simple and dumb, versus one that
  reimplements the real thing), and a test-doubles hierarchy. Upstream's dependency-injection and SDK-style examples
  are not included.
- `tests.md` is upstream's, with the "bypasses the interface" database example replaced by a naming-convention section.

**Why.** I wanted the skill to work from the first message in an unfamiliar repository (find the runner, match the
patterns) and to carry the mocking rules in the main file, where they are read.

### ci-cost-and-cadence and `measure-minutes.mjs` (Original)

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


### flaky-test-hunt and `repeat.mjs` (Original)

**Problem.** Agents and people label an intermittently failing test "flaky" and then add a retry, raise a timeout,
add a sleep or quarantine the test. The signal goes quiet but the cause stays, and sometimes the cause is a real race
or date bug in the product. Claims that a fix worked usually rest on one or two green runs, which says almost nothing
about a failure that happens one run in twenty.

**Changes for this release.** None; written for this release.

### migration-review (Original)

**Problem.** Migrations are usually reviewed only for whether the SQL is valid. What goes wrong in production is what
a valid statement does to a large table on a given engine version while the old code is still running: a lock that
queues behind one long transaction and blocks every query, a column rename that breaks the running release, a
single-statement backfill that floods the replicas, or a down migration that restores the columns but not the data.
Agents tend to approve these because they pass on an empty local database. The PostgreSQL rewrite and lock claims
were checked against a throwaway PostgreSQL 16 cluster; the MySQL and SQL Server notes come from documentation.

**Changes for this release.** None; written for this release.

### Test-tamper guard, `scripts/test-tamper-guard.mjs` (Original)

**Problem.** When the goal is a green suite, the cheapest edit is to the test: skip it, mark it as an expected
failure, or delete the assertion that fails. The suite goes green and the bug ships. Skipping is sometimes right, so
the hook asks the user instead of refusing, and it compares before and after so only what the edit adds is flagged.

**Changes for this release.** None; written for this release.

### Verify-before-done hook, `scripts/verify-before-done.mjs` (Original)

**Problem.** A report of "done" after edits that were never run is the most common false claim an agent makes, and a
rule that says "run the tests first" is skipped exactly when the agent feels sure. The hook reads the transcript, not
the summary: edits since the user's last message with no check after the last one send the agent back, once.

**Changes for this release.** None; written for this release.

---

## agent-orchestration

### No-idle hook, `scripts/no-idle.mjs` (Original)

**Problem.** A subagent that ends its turn waiting for a monitor, a background task or a message is not resumed by
anything. The rule "never end your turn waiting; use a bounded foreground loop" was in every brief, until one brief
left it out and the builder sat idle for an hour. As a hook, it no longer depends on the orchestrator remembering it.

It uses two paths, because neither covers every launch on its own: PreToolUse on `Agent` rewrites the prompt, and
SubagentStart adds context. One lesson is written into the code: the hooks documentation says `updatedInput` may be
partial, but in practice Claude Code validated it as the complete tool input and rejected a prompt-only
`updatedInput` ("The required parameter `description` is missing"). The hook returns the whole input with only the
prompt changed. It always exits 0 and never writes to stderr: a hook that failed closed would leave every session
without agents.

**Changes for this release.** Translated; the rule text can be replaced with `NO_IDLE_RULE`; `decide()` is exported
for tests.

### methodology (Original)

The method document, two of its adoption prompts and its templates, from a kit I extracted from a production project
and have since copied into several repositories. The prompt for retrofitting an existing project and the worked
examples were left out: both were written for specific projects.

**Problem.** A capable model produces artifacts that look finished. The method takes the power to certify work away
from the agent that built it: contracts with `verify` clauses, an evidence standard, separate builder and evaluator
contexts, convergence by adversary, mutation verification, falsified premises, two-file state.

**Changes for this release.** The source project's name, a file name and a run ID in the examples were replaced with
generic descriptions; a `SKILL.md` routes to the right door and the templates.

### codebase-oracle (Original)

0 of 1215 word 6-grams appear in any upstream version.

**Problem.** Planning and grilling sessions produce lists of questions about the code ("does the middleware already
handle X?"), and a model answering from framework knowledge guesses plausibly and wrongly. The oracle answers only from
evidence in the repository, says where it looked when the answer is not there, and never guesses.

**Changes for this release.** None.


### parallel-worktrees and `worktrees.mjs` (Original)

**Problem.** When several agents work on one repository at once, they often share a single checkout: one agent's
`git add -A` commits another's half-finished edit, and a branch switch or formatter run rewrites files mid-task. Even
with separate checkouts, pieces that quietly touch the same files, lockfiles or migration numbers leave conflicts that
someone resolves later with less context. Merging every branch and testing once at the end then hides which pair of
changes broke the build.

**Changes for this release.** None; written for this release.

---

## guards

### Inline-backtick guard, `scripts/block-inline-backtick-payload.mjs` (Original)

**Problem.** Backticks inside a double-quoted bash string are command substitution: `` node -e "...`x`..." `` runs `x`
and splices its empty output into the script. The rule against it was written down with five recorded instances and
was broken a sixth time while writing a retrospective about following rules. Four of the six had printed a success
line and left a file quietly wrong. By the third-time rule, it became a PreToolUse guard.

It is tuned against false positives, because a gate that cries wolf gets ignored: it blocked its own commit (a
`printf` whose prose mentioned `node -e`), which exposed two flaws, now fixed and tested: it must match the interpreter
at a command position only, and backticks inside single quotes are literal. A later miss added the case where single
quotes nested inside a double-quoted payload protect nothing.

**Changes for this release.** ESM with an exported `findBacktickPayload()`; the test uses the plugin path instead of
an absolute one; test labels no longer carry dates or private words. The 16 original cases are all kept, plus one for
other tools and malformed input.

### Merge guard and safe merge, `scripts/merge-guard.mjs`, `scripts/safe-merge.mjs` (Original)

**Problem.** With stacked pull requests, deleting the branch of a merged PR makes GitHub close every PR based on it.
`gh pr merge -d` closed two stacked PRs that way. The guard denies every raw `gh pr merge` (it denies too much on
purpose, never too little), and the merge goes through a script that merges pinned to the head commit it read, without
deletion, and deletes the branch afterwards only if no open PR uses it as its base.

**Changes for this release.** The original hard-coded one repository and its two long-lived branches. This version
reads the trunk from the repository's default branch, with environment variables for an expected repository,
promotion pairs (`develop->main`), protected branches and the merge method; it is translated, and the guard's message
prints the script's real path.

### dependency-security-audit (Original)

0 of 1504 word 6-grams of the original npm-only version appeared in any upstream version; the rewrite below was
written from that version, not from upstream.

**Problem.** Written during a coordinated security release of a major framework, when `npm audit` printed a long dump
with no order and no actions. The skill sorts findings into three tiers by what to do (patch now, plan a patch window, hygiene), checks for
fresh advisories that may not be in npm's feed yet, and pairs with the scanner-plus-`overrides` rule in `RULES.md`.

**Changes for this release.** Generalized from npm only to every common ecosystem: JavaScript (npm, pnpm, Yarn,
Bun), Python (pip, uv, Poetry, Pipenv), Go, Rust, Java and Kotlin, Ruby, PHP, .NET, Elixir, Swift, plus container
images and OS packages in Dockerfiles. The three questions and the three tiers are unchanged. Added a reachability
step, so an advisory in code the project never calls ranks lower (govulncheck, or grepping for call sites). Added
cross-ecosystem scanners (osv-scanner, Trivy, Grype), Dependabot alerts and direct OSV and GitHub advisory queries
for the fresh-risk check, and a rule never to install a scanner globally without asking. Per-ecosystem commands moved
to `ECOSYSTEMS.md` and per-registry supply-chain red flags to `SUPPLY-CHAIN.md`. Applying upgrades is handed to
`dependency-upgrade`.


### rule-to-hook (Original)

**Problem.** Rules written in CLAUDE.md, AGENTS.md or a style guide get broken again and again while they are still
written down, and rewriting the sentence does not help. When someone finally turns a rule into a hook, they often
guess at the hook contract, block harmless near-misses until the guard gets switched off, crash closed on unexpected
input, or ship a test that has never been seen to fail. The skill makes the conversion a repeatable process: real
examples first, a deliberate choice of mechanism, a pure decision function with a DENY/PASS test table, a proof that
the test can fail, a live check, and a pointer from the rule to what now enforces it.

**Changes for this release.** None; written for this release.

### dependency-upgrade (Original)

**Problem.** Agents asked to "update dependencies" tend to bump many majors at once, regenerate the lockfile wholesale
and fix whatever breaks. The result is one large commit that cannot be bisected or partly reverted, with transitive
upgrades nobody reviewed. Upgrades started on a failing baseline cannot be judged at all, and version numbers recalled
from memory are sometimes wrong or not yet released. The skill makes the safe order explicit: baseline first, research
from primary sources, toolchain before frameworks, one major per commit, and a report of what was skipped or blocked.

**Changes for this release.** None; written for this release.

### Secret guard, `scripts/secret-guard.mjs` (Original)

**Problem.** An agent handed a key to get something working pastes it where it is used. From there it reaches a
commit, and a pushed key has to be rotated even after the commit is reverted. The guard checks the text being written,
by known token formats and by random-looking literals assigned to secret names, and leaves `.env` files alone.

**Changes for this release.** None; written for this release.

### Destructive guard, `scripts/destructive-guard.mjs` and `scripts/shell.mjs` (Original)

**Problem.** Each command it blocks has a well-known story: `rm -rf "$DIR/"` with an empty variable, a force push
over shared history, `git reset --hard` over hours of uncommitted work, `git clean` on files git never stored. The
guard checks git state only when it matters, so ordinary cleanup on a clean tree still passes. `shell.mjs` splits a
command line into simple commands, including `sh -c` payloads, so guards can tell which program a flag belongs to.

**Changes for this release.** None; written for this release.

### No-verify guard, `scripts/no-verify-guard.mjs` (Original)

**Problem.** When a pre-commit hook fails, the shortest path to a commit is `--no-verify`, and the failed hook was
the useful signal. The guard covers the flag, its short form inside option groups, and the environment variables and
config overrides that do the same thing, while understanding quoted commit messages.

**Changes for this release.** None; written for this release.

---

## planning

All four are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, see `NOTICE`). Each
`SKILL.md` carries a `license` line and an `upstream` link in its frontmatter.

### grill-me (Adapted from [`grill-me`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me))

Closest upstream: the 7-line version of 2026-03-26 to 2026-04-28. Upstream has since turned `grill-me` into a pointer
to a new `grilling` skill that asks questions in rounds.

**What this version changes.**
- A description with trigger phrases.
- The single paragraph is restructured into rules.
- "Explore instead of asking" now says what *is* worth asking: intent, priorities, tradeoffs and preferences.
- "Be relentless: don't stop early to be polite or to save time."
- A "When it's done" section: no unresolved branches, "could you hand the plan to someone else", and a summary of the
  decisions for the user to confirm.
- It keeps one question at a time.

**Why.** The short version stopped early and ended without a record of what was decided.

### to-prd (Adapted from [`to-prd`](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-spec), now `to-spec` upstream)

Closest upstream: `skills/engineering/to-prd`, 2026-04-17 to 2026-04-28 (about half of my 6-grams).

**What this version changes.**
- It saves the PRD as a markdown file and offers to submit it to whatever tracker the project uses, instead of always
  creating a GitHub issue.
- User stories must cover edge cases and error states.
- Out of scope "be explicit; this prevents scope creep".
- A Rules section: no interviewing (run a grilling skill first), flag shallow modules, no file paths or code snippets,
  exhaustive stories ("if you can think of 10, write 20", including accessibility).
- The template's XML tags became headings, and the banking example was removed.

**Why.** Not every project tracks work in GitHub issues, and the first drafts it produced were thin on unhappy paths.

### to-issues (Adapted from [`to-issues`](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-tickets), now `to-tickets` upstream)

Closest upstream: `skills/engineering/to-issues`, 2026-06-03 to 2026-07-06, and the earlier `prd-to-issues`
(2026-02-25) for the AFK/HITL split. About 19% of my 6-grams are upstream text; the rest is rewritten.

**What this version changes.**
- Tracker-agnostic: no setup skill and no triage labels; issues can be files.
- It keeps the AFK/HITL slice types, which later upstream versions dropped.
- An explicit vertical-versus-horizontal example.
- The approval list shows title, type, dependencies and scope.
- The issue template gains "Slice Type" and "Notes" fields.
- A Rules section: vertical not horizontal, use the domain vocabulary, each slice independently testable, dependency
  order, and a size guide (3 to 8 slices for a typical feature; past 12 is too thin or the feature should split).
- Removed: upstream's prefactoring step and its quiz questions.

**Why.** I use it across projects with different trackers, and without a size guide it over-sliced.

### improve-codebase-architecture (Adapted from [`improve-codebase-architecture`](https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture))

Closest upstream: `SKILL.md` 2026-04-28 to 2026-05-27; `LANGUAGE.md` and `INTERFACE-DESIGN.md` 2026-04-24 to
2026-06-10. `LANGUAGE.md` is essentially upstream's (97% of its 6-grams), trimmed.

**What this version changes.**
- Self-contained: links to files that are not part of it are removed (`DEEPENING.md`, and `CONTEXT-FORMAT.md` and
  `ADR-FORMAT.md` in another skill).
- It no longer requires the Explore subagent.
- `CONTEXT.md` and `docs/adr/` are used if they exist.
- `INTERFACE-DESIGN.md` generates three or more designs inline under named constraints (minimize the interface,
  maximize flexibility, optimize the common caller, ports and adapters), instead of spawning parallel subagents.
- Each key principle gets a one-line explanation.
- A Rules section: no code in this phase, domain language first, respect ADRs, be opinionated.
- Broader trigger phrases.

**Why.** I run it in sessions and tools where subagents and the sibling skills are not available.

---

## Not published

| Skill | Finding from the diff | Where it is listed |
|---|---|---|
| grill-with-docs | Abridged copy of upstream `grill-with-docs` (2026-04-28 to 2026-04-30; 73% of 6-grams shared). The changes are removals (example trees, the CONTEXT-FORMAT and ADR-FORMAT references) plus trigger phrases and one paragraph relating it to grill-me. | README, "I also use, unmodified" |
| prototype | Abridged copy of upstream `prototype` (2026-05-06 to 2026-07-10; 84 to 86% of 6-grams in `SKILL.md` and `LOGIC.md`). The changes condense upstream text; the only addition named an issue tracker. | README, "I also use, unmodified" |
| bro | No shared text with upstream `wait-what` (0 of 264 6-grams), but it carries a `license: MIT` line and a Portuguese-language rule that suggest another source I have not found. Left out until its origin is known. | Not listed |
