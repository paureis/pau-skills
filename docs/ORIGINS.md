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

The skills adapted from [pstack](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack)
(`arena`, `architect`, `bug-fix`, `verify-app`, and the later ones named in their sections) were compared the same way, file by file, against that commit of
Cursor's plugin repository. pstack is a single snapshot, so there is no history to search.

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

**Later changes (2026-10-18).** Ideas from pstack's `reflect` (`references/synthesizer.md`,
`references/divergent-reviewer.md`), in new words (0 of 1,670 word 6-grams of the SKILL.md after the first pass appear
in reflect's `SKILL.md`, `synthesizer.md` or `divergent-reviewer.md`): a decision-changing gate before the audit
search (a row that adds text must change what a future agent does; a user correction always goes on to the search),
a lens for decisions that were right for the wrong reason, the learning beneath the obvious one, one piece of evidence
per row, approval row by row, only the user's own corrections count, a route that enforces a DUPLICATE, and a route
for a skill that did not start (its description, edited at its source within its limits). A cold run showed the audit
could not see short CLAUDE.md bullets or skills synced from claude.ai. Since the fifth batch, `--check` scores a
bullet of 12 or fewer content words with a word score (a candidate the agent confirms by reading the bullet; bullets
of one or two content words are still read by hand) and reads synced skills, printed with their path, which stay out
of the pairs report.

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

**Later changes (2026-10-18).** An idea from the pstack session-pickup playbook (treat the trail as the record, do
not redo finished work, verify inherited claims), in new words: the handoff's top block carries the resume rule, each
claim carries a cheap "How to check" that exercises it, a check ends as holds, false or could not check, and only
reading checks and tests marked safe run before approval. Checks are limited to cheap ones because the playbook
contradicts itself on re-running a repro. It also fixes a dangling reference to "first commands listed below".

### Roadmap hook, `hooks/session-discipline/roadmap.mjs` (Original)

**Problem.** The roadmap is the only order of work: one item at a time, the next one starts only when the previous one
meets its definition of done, and blocked items are marked and skipped. Sessions that started from memory of the last
session drifted from that order. The hook prints the current item, the next pending one, the blocked ones and the open
questions at session start, so the order is in context before the first message.

**Changes for this release.** The original parsed fixed headers in another language and fixed paths. This version
reads paths, table headers, the status column name, status words and the "answered" pattern from
`.claude/roadmap.json`, finds columns by header name, and prints nothing when the project has no roadmap. The pure
`summarize()` function is exported for tests.


### instructions-audit and `scan.mjs` (Original)

Named `claude-md-audit` until 2026-10-17; claude.ai refuses skill names that contain "claude".

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

**Later changes (2026-10-18).** Ideas from pstack's `poteto-help` and its `references/prompting.md`, in new words
(about 1% of the added word 6-grams appear there): a "fix a run that went wrong" symptom table, check the project's
state only when it changes the answer, route a skill missing from the tables by its own description, and the checklist
for wording a request, with `sharpen` offered for a task about to start.

### Branch-context hook, `hooks/session-discipline/branch-context.mjs` (Original)

**Problem.** Agents assume a clean tree on a feature branch. They commit onto the default branch, build on a branch
that is far behind its upstream, or start new work in the middle of an unfinished rebase. All of it is visible with
a few read-only git commands that nobody runs first, so the hook runs them at session start.

**Changes for this release.** None; written for this release.

### Compact-snapshot hook, `hooks/session-discipline/compact-snapshot.mjs` (Original)

**Problem.** Compaction keeps the gist and drops the specifics: the user's exact words, the files already changed,
the open todo items. The agent resumes confident and slightly wrong. The hook writes those facts to a git-ignored
file before compaction and prints them when the compacted session starts, which is the moment they are needed.

**Changes for this release.** None; written for this release.

### project-setup (Original)

Written for this release. It shares no text with any upstream version.

**Problem.** People who already use Claude in the browser want to try Claude Code on a real project, and the first
session goes badly in predictable ways: they do not know what to ask, they are surprised by what it changes, and
the next session has forgotten how they wanted to work. `/init` writes a CLAUDE.md from the code alone, so it cannot
record what only the person knows: how much they want explained, how much freedom Claude gets, what "done" means,
and what must never happen. This skill asks for exactly those things, one question at a time, and skips anything
the files already answer.

**Changes for this release.** None; written for this release. Design decisions: it stands alone (no other skill or
plugin needed) and finds its bundled files through `${CLAUDE_SKILL_DIR}`, so it also works when copied into
`~/.claude/skills/` on its own. Its writing rules are a relaxed form of ASD-STE100 Simplified Technical English:
short sentences, active voice and fixed terms, without the controlled vocabulary. It changes no settings files and
writes each file only after the person approves the exact text. The claims about Claude Code in `GUIDE.md` were
checked against the documentation in October 2026. `evals/project-setup/` runs it against three simulated users and
grades the transcripts.

---

## verification

### mutation-test and `skills/verification/mutation-test/mutate.sh` (Original)

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

**Later changes (2026-10-17).** Ideas from pstack, no shared text (0 of 1,358 word 6-grams): the two-edit check in
`skills/principle-test-behavior-not-implementation/SKILL.md`, and backlog decision 1. `mutate.sh` gained `--refactor`,
the second edit: a pure refactor must leave the command green (KEPT, exit 0; BROKE, exit 1, with the changed lines;
exit 2 as before), with the same dirty-tree, control, applied, one-file and restore checks. The skill now prefers a
real past mistake as the mutation: find the fix commit with `git log --grep`, `-S` or `-G`, and feed it reversed with
`git show -R --format= --no-color <sha> -- <file>`. The harness refuses an edit that deletes or empties the file, which
a reversed commit that added or renamed it produces; a review found that such a patch read as CAUGHT. BROKE says to
read the failure first, since a build error means the refactor was wrong. The skill says paths are relative to the
repository root, how to keep one bug's hunks, how to handle a fix spread over several files and runner caches, and
when a runtime error counts as a catch.

**Later changes (2026-10-19).** Two cases where the harness trusted file times. With Python, a same-size mutation
written in the same second as the control's bytecode read SURVIVED (13 of 15 back-to-back runs in the fourth batch's
dry run): the harness now runs its commands with `PYTHONDONTWRITEBYTECODE=1` and a throwaway `PYTHONPYCACHEPREFIX`.
And `git checkout` skips a file whose size and time match what the index recorded, so a command that set a fixed
time left the mutant in place behind a false RESTORED: the restore now checks out, compares content with
`git cat-file --filters`, and deletes and checks out again only when the content still differs; it refuses at the
start a file with an edit git does not see, a skip-worktree or assume-unchanged file, and an absolute or `..` path, and
reports a command that staged or committed the mutant. A review of the first fix found it could erase such hidden
edits and delete files on the error paths; the fix round closed both.

### evaluator (Original)

From the methodology kit's evaluator prompt (see `methodology` below).

**Problem.** An agent cannot certify its own work. In one project, an evaluator that had not seen how the code was
built found a security test that asserted its own mock, a module with zero coverage inside a green suite, and twelve
bypasses of a boundary gate the builder believed airtight. The prompt had to be pasted into a fresh chat; as a skill
it runs with `context: fork`, so it starts without the builder's conversation by construction.

**Changes for this release.** Converted from a paste-in prompt to a forked skill with `$ARGUMENTS` for the scope; it
points at `mutate.sh` for mutation checks; the notes for the human running it moved to the end.

**Later changes (2026-10-18).** Ideas from pstack (`docs/guide/06-verify-and-ship.md`,
`skills/poteto-mode/playbooks/shipping.md`), in new words (0 of 630 word 6-grams): what counts as a live reproduction
for each change type (a storage assertion about the stored form reads the raw value), a check that could not run marked
UNVERIFIED with `inconclusive:` (a resource the change requires is not a FAIL), and an `Evaluated:` line naming the
commit, base and patch id the verdict covers, withheld on a dirty tree.

**Later changes (2026-10-19).** A cold run of the fourth batch showed an agent reading "a passing automated test that
you have run and watched pass" as enough evidence without the mutation check the same skill requires, and filling the
`Mutation:` field with a claim it never ran. A passing test now counts only once its mutation check made it fail, an
unrun "would catch" is not evidence, and the `Mutation:` field records the defect, the command and CAUGHT, SURVIVED or
NOT MUTATED, with what each means for the verdict.

### tdd (Adapted from [mattpocock/skills `tdd`](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd) and [pstack](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/principle-test-behavior-not-implementation/SKILL.md))

Closest upstream: `skills/engineering/tdd`, versions from 2026-02-04 to 2026-04-28. Before the pstack changes, about
16% of my `SKILL.md` 6-grams were upstream text; with the added text that is now about 9% (scaled, not recomputed).
`tests.md` is about 70% upstream; `mocking.md` shares none. pstack: `skills/principle-test-behavior-not-implementation/SKILL.md`
and `skills/tdd/SKILL.md`, with one idea from `skills/principle-sequence-verifiable-units/SKILL.md`. 57 of my 1,694
word 6-grams (3.4%) appear in those files: 48 from principle-test-behavior-not-implementation, 9 from tdd.

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

**What this version changes (from pstack, 2026-10-17).**
- "No test is too small" is replaced by pstack's "prefer no new test over a bad test", with its list: mostly tests
  mocks, encodes implementation details, depends on timing or unrelated global state, needs expensive infrastructure
  for a small fix, would be deleted right after proving the fix. For a fix or a small change with only such a test on
  offer, the closest executable check replaces it, shown failing before and passing after, and the report says which
  check and why. A feature built test first still starts every slice with RED.
- "Before You Start" no longer sets up test infrastructure for a small fix in a project with no test path.
- The two-edit check from principle-test-behavior-not-implementation: break the behaviour (the test must fail),
  change only the internals (the test must still pass). It points at `mutation-test` if it is installed (its harness
  and `--refactor` mode) and gives the steps by hand. The harness pointer says it needs committed work, one file per
  edit, and paths from the repository root; the refactor edit runs every covering test, and a build error blames the
  refactor.
- "Take the expected value from the requirement, not from a run of the code" and "an exact error message pins wording
  no caller reads" join "What to test".
- The "querying a database directly" example of a bad test is gone: state a caller can read back, such as a stored
  row, is behaviour.
- From principle-sequence-verifiable-units, an idea only: a bug fix commits the failing test before the fix, so red
  then green can be replayed.
- The refactoring rule now says a test that breaks on a refactor either caught a behaviour change or is pinned to the
  implementation.
- Not taken: pstack tdd's bug-fix-only scope, its "Guardrails" and "Final Response" sections, and
  principle-test-behavior-not-implementation's paragraphs on mocked-service payloads and invariants.

**Why.** I wanted the skill to work from the first message in an unfamiliar repository (find the runner, match the
patterns) and to carry the mocking rules in the main file, where they are read. The pstack changes stop it from pushing agents to add
brittle tests to every small fix, and give a check for whether a test is worth keeping.

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

**Later changes (2026-10-18).** An idea from the pstack babysit playbook (classify a CI failure before a retry), in
new words: fetch and deepen first; a failure in code the branch never touched suggests a stale base, checked against
the base CI actually tested (a pull request's merge commit names it); one re-run at most, as a diagnostic, and a CI
re-run only when asked; two identical failures end the hunt only when CI history and a few local runs agree, since a
one-in-three flake fails twice in a row one time in nine. A cold run showed the description did not start the skill
for a failed CI run someone wanted to retry, so it now names that situation.

### migration-review (Original)

**Problem.** Migrations are usually reviewed only for whether the SQL is valid. What goes wrong in production is what
a valid statement does to a large table on a given engine version while the old code is still running: a lock that
queues behind one long transaction and blocks every query, a column rename that breaks the running release, a
single-statement backfill that floods the replicas, or a down migration that restores the columns but not the data.
Agents tend to approve these because they pass on an empty local database. The PostgreSQL rewrite and lock claims
were checked against a throwaway PostgreSQL 16 cluster; the MySQL and SQL Server notes come from documentation.

**Changes for this release.** None; written for this release.

### Test-tamper guard, `hooks/verification/test-tamper-guard.mjs` (Original)

**Problem.** When the goal is a green suite, the cheapest edit is to the test: skip it, mark it as an expected
failure, or delete the assertion that fails. The suite goes green and the bug ships. Skipping is sometimes right, so
the hook asks the user instead of refusing, and it compares before and after so only what the edit adds is flagged.

**Changes for this release.** None; written for this release.

### Suppression-reason hook, `hooks/verification/suppression-reason.mjs` (Original)

An idea from pstack `agents/comment-sicko.md`, which names three suppressions "and similar"; no shared text.

**Problem.** When a linter or type checker complains, the cheapest edit is to silence it, and a bare suppression hides
both the warning and why it does not apply. The hook reports, through `additionalContext` only, an edit to a code file
that raises the count of suppressions with no reason, in about a dozen languages. It never blocks or approves. What
counts as a reason (free text in the tool's own syntax, or a comment on the line above) is this hook's own criterion. A
review found false reports on comments that named a directive and on string literals, a missed Vue case and a path
filter that skipped whole projects; all were fixed test first before the release.

**Changes for this release.** None; written for this release.

### Verify-before-done hook, `hooks/verification/verify-before-done.mjs` (Original)

**Problem.** A report of "done" after edits that were never run is the most common false claim an agent makes, and a
rule that says "run the tests first" is skipped exactly when the agent feels sure. The hook reads the transcript, not
the summary: edits since the user's last message with no check after the last one send the agent back, once.

**Changes for this release.** None; written for this release.


### review-triage and `review-scope.mjs` (Original; learned patterns and two triage rules adapted from [pstack `bugbot-triage.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/references/bugbot-triage.md))

Written in one of my projects on 2026-10-15, as that project's rules for reviewing a change. The rating idea came from
a "value against effort" chart in a post I read: each candidate change placed by value and effort, shaded by risk, and
labelled "judgement, not measurement". No text was taken from anywhere.

**Problem.** AI reviews over-verify. They can always find one more thing, and each fix can bring a new bug, so the
review and fix loop does not end by itself. The project needed limits on what was worth changing: a finding has to
name a failure (this input, this wrong result) or it is a preference; findings go to must fix, fix if cheap, or leave;
the risk of the fix is weighed as well as the problem, because a small fix in the riskiest code can break more than it
repairs; every fix has a test that fails without it; the second look covers only the fix; and there is one review
round and one fix round.

**Evidence so far.** Two real runs, on 2026-10-16. A release preparation touching 7 files: one review round, nothing
met the bar, no fix round. A feature of about 600 lines across 11 files: one finding, a misleading message, rated
fix if cheap and fixed test first in one fix round; the second look covered only the fix. That finding came from
asking the implementer to list anything it was unsure about. Not yet seen: a must-fix found in review, or a fix that
caused a new bug, which is the case the round limit exists for. In the same project, a reviewer that checked the plan
against the real environment before anything was built found a real design gap, which is why the method says review
before building pays more.

**Changes for this release.** The project's must-fix list and its risky files became configuration in
`.claude/review-rules.json`, with defaults that hold for any project. The rating became low, medium or high instead of
1 to 5, and is never turned into a score. Added: the check that a claimed impossible state really is impossible, the
rule that an unsettled security finding goes to the maintainer, the rule that a repeated finding stays left, the
reviewer prompt, and `review-scope.mjs`, which prints the rules, scopes the change and flags a fix round with no test,
in risky code, or outside the change. `TRIAGE.md` and the script are shared with `lean-subagent-dev`, which carries
identical copies.

**pstack additions (2026-10-17).** Closest upstream: `skills/poteto-mode/references/bugbot-triage.md` and
`skills/interrogate/references/lead-judgment.md`. The whole `TRIAGE.md` shares about 1% of its word 6-grams with them
(24 of 2,094), all in the added text: the field labels of the pattern template and two phrases. `SKILL.md` shares
none. What this version changes:
- "I would have done it differently" (lead-judgment) becomes a bullet in section 1: it names no failure until it shows
  a concrete problem, and goes to Leave with the reason written down. With a problem shown, that problem is the
  finding. A security concern dressed as an alternative goes by the security rule.
- Nitpick gravity (lead-judgment) is placed after the bucket table as a conclusion about the whole review, reached
  only after every finding went through step 2. It is not a bucket, and it does not apply while any finding that names
  a failure is still open, or when any finding is a must-fix. Upstream's "Hypothetical vs. Actual", "Premature
  abstraction" and "Missing context" were already covered by steps 1, 2 and 4, so they were not taken.
- The learned-pattern format (bugbot-triage) keeps its five fields and three levels. Bugbot and pull request threads
  go away: patterns live in a file the maintainer agrees to (for example `.claude/review-patterns.md`), the agent may
  add a candidate, and recurring or strong needs the maintainer's yes. A pattern does not replace checking the claim:
  a recurring or strong pattern sends a finding to Leave only when step 2 did not reproduce or trace the failure
  (upstream: dismiss only when the current code or context proves no change is needed). A reproduced or traced
  failure, and a "fix by default" pattern, take their bucket from section 4; a candidate is a hint, not a skip.
  Upstream's fix, dismiss and ask classes are not taken; the three buckets stay.
- The "ask by default" list becomes "no pattern ever skips these", with the must-fix list added on top: a learned
  pattern never turns a must-fix into a leave. A person's dismissal of a security finding is an owner's call, not a
  pattern. Upstream's example patterns (UI changes, stacked pull requests, browser behaviour) are not taken.
- The reviewer prompt asks the reviewer to say so when it finds nothing serious, instead of filling the list with
  nits. The report gains "Nitpick gravity" and "Learned patterns" lines.

The review of this change found that a learned pattern could send a reproduced failure to Leave; the rule above is the
fix.


### bug-fix (Adapted from [pstack bug-fix playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/bug-fix.md))

Closest upstream: `skills/poteto-mode/playbooks/bug-fix.md`, with `skills/principle-attack-the-premise/SKILL.md`,
`skills/principle-fix-root-causes/SKILL.md`, `skills/principle-prove-it-works/SKILL.md`, `skills/blast-radius/SKILL.md`
and `automations/benny/skills/reproduce-and-fix-issues/references/verify-existing-fix.md`. About 5% of my `SKILL.md`
word 6-grams (136 of 2,775) appear in those files, mostly from fix-root-causes, blast-radius and attack-the-premise.
`EVIDENCE.md` shares none.

**Problem.** Agents fixing a bug tend to add a guard where it crashed, keep "might help" changes, try a third fix on
the same wrong belief, and call it fixed from a unit test or from one run.

**What this version changes.**
- The playbook's six steps become nine and take in the principle skills it links to: the legitimacy test for guards
  (a guard is a fix only when the state it guards is legitimate), attack the premise after two failed fixes that rest
  on it, suspect the observation method, and a blast-radius step that names the one fact the change is safe because
  of, with a five-rung proof ladder.
- From verify-existing-fix: reproduce twice from a clean state, "no baseline, no claim", and a section for verifying
  a fix that already exists, with versions checked out in separate worktrees, never over the user's changes.
- Added: a search for an existing fix in step 1; work on a branch; a hypothesis log whose rows count only with pasted
  output, with predictions if true and if false; reverting every change a refuted hypothesis motivated; the failing
  repro committed before the fix and the fix committed before the proof; paths back when a fix or its safety check
  fails; the verdict "reproduced, not fixed"; a report template.
- Removed: Cursor's control skill and `/loop`, model and speed choices, the other pstack skills it called, and the
  instruction to delegate the investigation. An independent check goes to `evaluator` if it is installed, or to a
  fresh subagent.
- New `EVIDENCE.md`, language-neutral: driving and resetting each surface, runtime evidence per language,
  `git bisect run`, checks on the observation itself, and expected-failure markers with how to pin the reason a test
  fails (pytest `raises=`, Rust `should_panic(expected = ...)`).

**Why.** The playbook depends on Cursor and on other pstack skills for its key rules. A Claude Code agent needs them
in one place, for any language and surface. Tried on a planted off-by-one whose obvious fix is a guard: the
legitimacy question led to the producer, not the guard.

### verify-app and `check-map.mjs` (Adapted from [pstack `create-verification-skill`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/create-verification-skill))

Closest upstream: `skills/create-verification-skill/SKILL.md` and its `references/feature-map-example/`,
`skills/maintain-verification-skill/SKILL.md`, and `docs/guide/06-verify-and-ship.md`. Shared word 6-grams, measured
before the review round (which only lowered them): `SKILL.md` about 6%, `MAINTAIN.md` about 9%, the templates about
2%, the example map 0 to 1%; `DRIVING.md` and `check-map.mjs` none. The shared part is mostly structure: the
interview questions, the Launch, Doctor, Drive, Evidence and Cleanup sections, the four upstream feature headings
(Sub-features, How to get to it, Driving it, Gotchas), the end-to-end proof, and maintain's outcomes and rules.

**Problem.** An agent says a change works without having used the running app, because the project has no written way
to start it, drive it and keep proof.

**What this version changes.**
- Two upstream skills become one: maintain is the `maintain` argument, with its steps in `MAINTAIN.md`. An existing
  verify skill is used instead of writing a second.
- Written for Claude Code: output goes to `.claude/skills/verify-<app>/`; questions through AskUserQuestion one at a
  time; the Agent tool for the per-feature source check and for a cold-reader proof, or a fresh session.
- Run state is explicit: one exported env file per run; every place the app writes (current folder, home, XDG
  folders, temp, configured paths) pointed into the run folder, with a git status check that nothing escaped into the
  repository; one record of what the run started, with a start-time check before any process is stopped; tmux on a
  private socket; scratch files named with the run ID and deleted only by recorded path; the run folder removed only
  after the stop is confirmed.
- Templates with every spot to fill marked, server and CLI variants of Launch and Doctor, numbered evidence per step,
  and an explained "not yet proven on the real target" section.
- New `DRIVING.md`: the project's own harness first, with signals per ecosystem, then fallbacks for web, CLI, TUI,
  HTTP, mobile, desktop and libraries, and port-owner commands per OS.
- New `check-map.mjs`, a checker for the generated skill: frontmatter, required sections with a command in Launch,
  Doctor and Cleanup, leftover template tokens, the index against the feature files (subfolders and the common link
  forms), the five feature headings (the upstream four plus States, added in Q7), and an evidence folder that git
  ignores and does not track. Markdown is read the CommonMark way where it matters.
- States and skeletons (Q7, Original, from Aiden Bai's post on X of 2026-10-18 on measuring the loaded UI with
  Playwright to match a skeleton, and the "empty, loading and error states on every screen" line of the
  production-readiness list behind Q6): each feature file gains a fifth heading, States (how to force loading, empty
  and error, with a screenshot each, or one line for a feature with no screen), which `check-map.mjs` requires and,
  for older maps, says maintain mode adds. The generated skill gains a States and skeletons recipe with a copied
  in-page helper, `measure-boxes.js`, that pairs skeleton and real boxes by marker or document order, reports boxes
  off by more than 4 px and a layout-shift score above 0.1 (Chromium only, skipped elsewhere), fails when nothing
  matched, and resizes a skeleton only on a yes before measuring again. Maintain mode reports a skeleton mismatch as
  a product gap.
- The example map is rewritten (invoices, driven through a browser, an API and a CLI).
- Removed: Cursor paths and commands, and the guide's pull request, shipping and benchmark material.

**Why.** Proving behaviour in the real app is the step agents skip most, and pstack's pair of skills is the clearest
method I found for making it repeatable. A dry run on a fixture service and a cold run by a fresh agent on a fixture
CLI (`tests/fixtures/verify-app/`) found the export and current-folder problems that the review round fixed.

### hillclimb and `decisions.mjs` (Adapted from [pstack hillclimb playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/hillclimb.md))

Closest upstream: `skills/poteto-mode/playbooks/hillclimb.md`, with the perf mantras from `playbooks/perf-issue.md`
and the checklist from `skills/benchmark-checklist/SKILL.md` and `skills/principle-explain-the-number/SKILL.md`.
`SKILL.md` shares about 2% of its word 6-grams with them and `BENCHMARK-CHECKLIST.md` about 24% (19% from
`benchmark-checklist`, 5% from `explain-the-number`), measured before the review round. The structure is shared: the
steps of the loop, the mantra order and the checklist questions. `decisions.mjs` is mine.

**Problem.** An agent asked to make something faster reads the code, makes several changes at once, runs it once and
reports a percentage. Or it stops at the first lucky win, keeps "might help" tweaks, and leaves no record of what was
tried.

**What this version changes.**
- The agent makes each change itself. Upstream's subagent with a configured model and parallel worktrees become an
  optional extra (the Agent tool with `isolation: "worktree"`, measured one at a time).
- The harness is proven sensitive by a required deliberate regression that must read "worse, beyond noise", then
  reverted. Upstream's contrasting workloads and printed error and work counts are optional.
- One measurement format (median, run count, spread as max minus min) and one noise rule (a gap larger than the larger
  spread).
- The log lives outside the working tree; upstream used a gitignored file, which `git clean -fdx` removes. It is
  append only, a correction is a new row that stands for its attempt everywhere, and the stop predicate is written in
  the baseline row.
- `decisions.mjs` is new: `append` refuses a keep without a measurement, a run count and a spread, a keep that is worse
  or within noise of the best kept number (unless it is a behaviour-preserving simplification), a baseline with
  failing tests, and a log inside a git work tree; `measure` repeats any command and prints the format at full
  precision; `summary` prints the table; a `final` row records the closing check.
- Harness detection for any ecosystem (`cargo bench`, `go test -bench`, `pytest-benchmark` or `asv`, JMH,
  BenchmarkDotNet, a bench target in the task runner), with a fallback for size, memory and score metrics.
- The mantras in order only, without perf-issue.md's "when an earlier mantra meets the target, stop".
- Added: a clean tree and a branch first, a regression gate on every attempt, the noise-floor rule, a fixed run count
  chosen for the runs you hope to reach, and a final check that measures the baseline commit and the final commit
  alternately.
- Dropped: opening a pull request and the links to Cursor-specific principle skills. The checklist gains profilers
  per ecosystem, a warning about tracing-profiler inflation, and Amdahl's 1/(1-p) form.

**Why.** The discipline upstream describes (one change, one measurement, keep or revert, no win from reading code) is
what matters, and as prose an agent bends it. The script makes the log the gate every keep passes through. The review
round found that a correction was judged against itself and that "simplification" keeps could drift without limit;
both are refused now.

**Later changes (2026-10-19).** `decisions.mjs` writes a single quote in front of any `decision.tsv` cell a
spreadsheet would read as a formula (the delta always starts with `+` or `-`), reads it back without the quote so old
logs still read, and refuses a value that would not read back as typed. The rule matches `overnight-run`'s `log.mjs`.

### skill-eval and `skill-eval.mjs` (Adapted from [pstack eval playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/eval.md))

Closest upstream: `skills/poteto-mode/playbooks/eval.md`. Local models: `evals/project-setup/` (`run.mjs`, `grade.mjs`,
`JUDGE.md`) and this repository's `arena`. `SKILL.md` shares under 1% of its word 6-grams with `eval.md`; what comes
from upstream is structure: the blinding rules (no meta words, an organic prompt, no chain-eliciting cues, sanitized
names, runs that do not know of each other, one judge for both variants in one pass), the order of the steps, the 3 to
6 criteria rubric and the reply fields. `JUDGE-BRIEF.md` and `skill-eval.mjs` are mine; the script adapts small helpers
from `arena.mjs` and `run.mjs`.

**Problem.** A change to a skill reads better, but nobody knows whether the agent behaves differently. An author who
grades their own change sees what they hoped. A run that can tell it is being measured, or that finds a second copy of
the skill, measures the wrong thing.

**What this version changes.**
- Cursor `Task` candidates become headless `claude -p --output-format stream-json` runs. Subagents are not used: they
  inherit the session's skills and return no transcript.
- An isolation recipe found on Claude Code 2.1.302: an empty HOME, `--setting-sources project`, `--strict-mcp-config`,
  and an environment built from an allowlist (a run otherwise inherits the session's identity). The built-in skills
  remain and are named as a confound.
- `skill-eval.mjs` does the steps an agent gets wrong: it refuses meta words in the prompt, the path and file names
  (and warns on contents); refuses a root that is not new and empty, or that sits under an instruction file; makes
  neutral folders with a fresh repository each; reduces each transcript to what the run did; builds the blind copy from
  those actions and the diff, with the installed skill left out, paths replaced and the order shuffled; runs a reviewer
  with no tools on standard input; and unblinds with per-variant means and every disagreement.
- The "different model family" judge becomes a fresh `claude -p` reviewer with a hostile brief. The orchestrator
  scores blind first, and the script refuses to start the reviewer until it has.
- Runs get random ids in a shuffled order, so nothing printed before the orchestrator's own read gives the variants
  away; `run --force` rebuilds every run folder from the lab's pristine copies; scores use one strict `n/5` format.
- The login is checked under the empty HOME before any run; `--real-home` is the fallback, and SKILL.md says what it
  loses. Windows is refused for the real command rather than quoted half right.
- `--grade-reply` covers a skill whose reply is the work product (an interview skill such as `grill-me`), and the
  report says that a headless run shows only the first turn.
- Cost first, with the budget variable; at least 2 runs per variant.
- The meta-word list adds upstream's experiment, score, compare and arena to the backlog's words.

**Why.** In the dry run a long path made a run mistype its own folder, the rubric's guidance would have told the
reviewer about "variants", and the session id leaked through an environment variable. The review round found that run
ids in variant order let the orchestrator's own read see the variants, and that a rerun started from the previous
run's edits.

---

### launch-readiness, `ledger.mjs`, `table.mjs` and `rules.mjs` (Original)

Ideas only, from two posts the owner shared on 2026-10-19 (authors not recorded, text not saved): a long checklist of
what an app needs "before it touches a paying customer", which gave the area list and most checks, and a 16-line
"security prompt", which gave SEC-01 to SEC-15. Both were written again from general knowledge with a stack condition
on each check. The stage tiers borrow the idea of OWASP ASVS levels. The ledger, the probes, the questionnaire with
expiry and "no single score" were settled in the owner's `brainstorm` and `grill-me` sessions the same day.

**Problem.** An app built mostly by agents works in a demo and still has gaps: a route without an ownership check, a
key in the page, money stored as a float. Generic checklists are too long and not sized to the app, and a grade from
reading code alone misses what only a running app shows.

**What it does.** A profile the owner confirms before anything runs; stages 1 to 3 that stack, and regulated data
added to any of them; one area file per topic, loaded only when the profile needs it; evidence or "unknown", never a
grade from a package name; probe tests for security suspects, written into the project's own suite on a yes; a
questionnaire with expiry for what code cannot show; a `READINESS.md` ledger that `ledger.mjs` keeps (hashes of the
cited files, a stage marked "not assessed" until its rows are graded, probe rows that cannot pass from code, evidence
that refuses secret values); a verdict with at most ten must-fix rows and no single score; and small fixes on a yes,
bigger ones as briefs.

**Why.** The owner wants an honest answer before their own apps reach paying users, and the same check as the app
changes. The sixth batch's review found five ways the first ledger gave a false GO, all fixed with a test each; the
cold run on a fixture web app with five seeded gaps found all five and confirmed the ownership gap with a failing
probe.

## agent-orchestration

### No-idle hook, `hooks/agent-orchestration/no-idle.mjs` (Original)

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

**Later changes (2026-10-18).** Ideas from pstack (`autonomous-run.md`, `docs/guide/07-overnight.md`,
`show-me-your-work`), in new words (1 of 379 word 6-grams, the phrase "a plateau is not a stop"): a wrong log entry is
corrected by a new entry that supersedes it; a plateau is not a stop and is not convergence; a finish condition is
never relaxed to end a run (that is the contract-wrong branch, so it goes to the human); every unattended or
open-ended run has a stop (a dead end or a budget), recorded in `PROJECT.md` and owned by the human.

### codebase-oracle (Adapted from [pstack `how`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/how) and [`why`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/why))

Written as an Original skill: 0 of 1215 word 6-grams appeared in any upstream version. This version takes the evidence
tiers from pstack's `why` (`skills/why/references/epistemics.md`) and the explorer and explainer pattern from pstack's
`how` (`skills/how`). 58 of the 4,847 distinct word 6-grams in `SKILL.md`, `TIERS.md`, `EXPLORER-BRIEF.md` and
`EXPLAINER-BRIEF.md` appear in those upstream files: 40 in `how` and 18 in `why`.

**Problem.** Planning and grilling sessions produce lists of questions about the code ("does the middleware already
handle X?"), and a model answering from framework knowledge guesses plausibly and wrongly. The oracle answers only from
evidence: the code for what it does, the commit and pull request record for why. It labels how strong the evidence is
for every answer and never presents a guess as a finding.

**Changes for the first release.** None.

**What this version changes (2026-10-17)**, from a `git diff --no-index` against each upstream file:
- From epistemics.md: the five tiers (direct, supported, inferred, speculative, unknown) and the wording each allows;
  confidence words that need a citation next to them; never treating code as evidence for its own intent; the user's
  guess as one candidate among others; showing both sides when sources disagree; absence of evidence is not evidence;
  no tidy reasons fitted to messy history. The tiers live in a bundled `TIERS.md` that is pasted whole into each
  subagent brief. Upstream's tiers cover intent only. Here they also cover behaviour: code read along the whole path,
  or a run, is direct, and a thorough search that proves something is absent is direct. Upstream's output sections
  (What We Found, Competing Hypotheses and the rest) and its list of words to avoid are not taken; the oracle keeps its
  per-question format and adds Tier and Other candidates lines.
- Added here, not upstream: a stated reason must be about the exact thing asked; a documented link you cannot see is
  Inferred; documentation of a process is a claim about what people do; platform knowledge is Speculative until vendor
  docs or an experiment settle it; intent is Unknown only after the record lookup; an API error is not evidence; the
  tier count is of labels in the finished text.
- From how/SKILL.md and its two reference prompts: 2 to 4 explorers on separate angles, launched together, then one
  explanation in the format Overview, Key concepts, How it works, Where things live, Gotchas. The explorer report
  sections (Components, Flow, Boundaries, non-obvious things as Gotchas, Files read, Open questions) and parts of the
  explainer's instructions come across. Cursor's `Task` with model slugs from a rules file becomes the Agent tool: the
  `Explore` type where it exists, with its `model` field to raise a deep angle, and no model named. Upstream's simple
  path, one explainer subagent, becomes the existing single-agent flow. Every claim carries a tier and the summary
  counts them. Each question in a list is classified on its own; the cost line is the first step; with no Agent or Task
  tool the angles run in sequence; an explainer's tier may be lowered, never raised; a section is dropped only when it
  would be empty.
- From why/SKILL.md and why/references/sources/code-archaeology.md: the git commands (log --follow, -S, -G, blame -L,
  show) and reading pull request numbers from merge or squash commit subjects. `gh pr view --json` becomes the GitHub
  MCP tools or `gh api` REST routes (pulls/<n>, pulls/<n>/reviews, pulls/<n>/comments, issues/<n>/comments,
  commits/<sha>/pulls, with `--paginate`), because `gh pr view` needs GraphQL, which some environments block. New: what
  to do when the record cannot be reached, and shallow clones.
- Not taken: why's MCP discovery, the seven investigators (one per evidence category), the synthesizer and the
  Preserve / Change / Avoid / Risk list.
- The description now reads "from code and history, grading the evidence for each answer" instead of "from the code
  itself, with verified evidence for each answer". It is 348 characters, one fewer than before.

**Why.** Backlog item M7. A cold run with real explorers on this repository, in two headless sessions, found that the
cheaper model kept a big question on the single-agent path and called an intent question Unknown without looking at
the pull request record, and that the explorer brief invited trimming the tiers; the rules on classifying each
question, on Unknown, and the separate `TIERS.md` came from it.


### parallel-worktrees and `worktrees.mjs` (Original)

**Problem.** When several agents work on one repository at once, they often share a single checkout: one agent's
`git add -A` commits another's half-finished edit, and a branch switch or formatter run rewrites files mid-task. Even
with separate checkouts, pieces that quietly touch the same files, lockfiles or migration numbers leave conflicts that
someone resolves later with less context. Merging every branch and testing once at the end then hides which pair of
changes broke the build.

**Changes for this release.** None; written for this release.

**Later changes (2026-10-18).** Ideas from pstack `swarm` (a race with the selection rule declared up front),
`principle-separate-before-serializing-shared-state` (instructions are not concurrency control) and the
worktree-cleanup playbook (an audit's bucket is advice, not permission), in new words: a race shape that always asks
for its N-times cost unless the user asked for a race, with its own rules in every phase; what worktrees do not
separate (ports, databases, caches, the integration branch, tags and remotes), checked after each agent; and before
removing a worktree, a check that no agent, editor or watcher still uses it.

### lean-subagent-dev (Original; `TRIAGE.md` adapted, ideas from [pstack poteto-mode](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode))

Written in one of my projects on 2026-10-15, as that project's rules for how work runs: who does what, the brief, the
orchestrator's checks and the review. It was tried there before being generalised.

**Problem.** Subagent workflows I had used ran two reviewer subagents per task, which was slow, and review tools find
problems without deciding which are worth fixing. I wanted one builder, one checker and a short review: the main
session keeps the owner's questions and every push, pull request, merge and tag; code and test work goes to one
subagent with a written brief; the main session reads the diff, reruns the checks and runs a control itself; and the
review stops after one review round and one fix round.

**Evidence so far.** Two real tasks, on 2026-10-16 (the same two runs as `review-triage`). A release preparation of 7
files went to one subagent with a written brief; the orchestrator read the diff and reran the typecheck and tests,
and the review found nothing to fix. A feature of about 600 lines across 11 files went to one subagent from a written
plan; the orchestrator verified it with its own control (a fake configuration where the right value passed and the
wrong one failed), and the one finding, which the subagent had raised itself, was fixed in one round. The briefs that
worked named the exact files, the rules that apply, "commit, never push" and a fixed report format, and the line
"anything you were unsure about" surfaced the one real finding. Not yet seen: a must-fix in review, or a fix that
caused a new bug.

**Changes for this release.** The project's own lists became configuration. New: the usage budget (tight, normal,
generous, from `LEAN_SUBAGENT_BUDGET` or the project file), which sets the delegation threshold, the subagent's model,
the plan check and how much review to run, because a subagent costs more usage in total, not less; the plan check
before building; the brief template with its "stop and report if" section; the delegation log, so the way of working
can be judged after a week; and "when to step up" to the heavier methods.

**pstack additions (2026-10-17).** Ideas from `skills/poteto-mode/playbooks/orchestrate.md` and
`skills/setup-pstack/SKILL.md`, no shared text: `SKILL.md` and `BRIEF-TEMPLATE.md` share 0 word 6-grams with them. The
adapted text is in `TRIAGE.md`, the identical copy of review-triage's (see there). What this version changes:
- The budget table gets a "Subagent effort" row, set through the Agent tool's `effort` field. setup-pstack gives every
  role one level per budget (medium, high, xhigh, max) and never uses low. Here the builder gets medium, high and
  high, the plan checker high then xhigh, and the reviewer xhigh. The split is this skill's choice: the builder's work
  goes through the orchestrator's four checks, while the plan checker and reviewer are the check. low and max are not
  used. Effort is left out when unsure, on a smaller model, or for a fork.
- "Never write a slug you have not confirmed" (setup-pstack) becomes "never name a model that has not been confirmed
  available in this session": a model counts as confirmed when the Agent tool's own `model` field lists it or the user
  named it. The tight budget's smaller model is now offered to the user once and used only on a yes, because the Agent
  tool sets `model` only when the user asks.
- The standing-orders register (orchestrate: `preferences.md`, pasted into every spawn and resume) becomes a "Standing
  orders" block in the brief template (formerly "Rules for this task"), pasted unchanged into every brief and
  fix-round message. When an instruction gets repeated, it is added to the block.
- "Missing fields are a refuse-to-spawn condition" becomes a concrete check: no bracket placeholder and no guidance
  line in parentheses outside the report-format block; optional fields are marked "optional:" in their brackets and
  only they may be "none". The short form for a one-command task is kept.
- "Never resume an agent to check on it" becomes judging by side effects (commits in the worktree, files, test
  output), with `ListAgents`. A message is for a fix round or a real question. "Never resume-chain a brief" becomes:
  one fix round by message, a new task gets a fresh subagent. Cursor's dashboard, cloud agents, the `orch` CLI, ledger
  and frontier go away.
- The delegation log and the owner report name the effort.

This batch was run with the new version: every brief had a read-only plan check, every item a fresh reviewer and one
fix round, and the triage of every review used the new `TRIAGE.md`.


### arena and `arena.mjs` (Adapted from [pstack `arena`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/arena))

Closest upstream: `skills/arena/SKILL.md` and `skills/architect/references/runner-prompt.md`. `SKILL.md` shares about
8% of its word 6-grams with them (measured before the review round): the phase structure and a few sentences, such as
"every candidate gets the same prompt, so the prompt is the contract". `CANDIDATE-BRIEF.md` carries the runner rule
in other words; `JUDGE-BRIEF.md` and `arena.mjs` are mine.

**Problem.** One attempt at an interface or a module layout locks in the first shape that came to mind, and comparing
attempts by feel favours the one you would have written yourself.

**What this version changes.**
- Upstream gets diversity from several model families. Here each candidate gets one direction in its brief, from a
  table per task type; the Agent tool's model and effort fields are set only when the user asks.
- The judge is a fresh subagent with a hostile brief that sees the candidates under shuffled letters
  (`arena.mjs blind`), never the briefs, the key or the conversation, only reads, and scores criterion by criterion
  with evidence. When an artifact can be run, the orchestrator runs the same check on every candidate and hands the
  output over as `checks.txt`.
- A Score phase: the orchestrator writes its own scores before the judge is launched, so the verdict cannot anchor
  them.
- Candidates work outside the arena folder, so they cannot read the rubric or each other's briefs; the base commit is
  recorded before fan-out.
- `arena.mjs` refuses a rubric with fewer than 3 or more than 6 criteria or unfilled placeholders, detects dropouts
  (including empty output), never puts a link in the blind copy, never copies `.git` or a brief, and refuses to
  overwrite a key a judge may still be using.
- Cost first: N defaults to 3; on a tight `LEAN_SUBAGENT_BUDGET` it states the cost and suggests 2.
- References to poteto-mode and the principle skills are replaced by inline rules; verification uses `evaluator` if
  it is installed.

**Why.** Without other model families in the loop, a blind judge and different briefs are what stop the comparison
from reflecting my own preference. In the dry run on a helper's interface in this repository, the judge caught a
broken import the orchestrator had missed. The review round closed two leaks in the blind copy (links and a background
verdict arriving before the orchestrator's own scores).

### overnight-run and `log.mjs` (Adapted from pstack [`docs/guide/07-overnight.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/docs/guide/07-overnight.md), `skills/poteto-mode/playbooks/autonomous-run.md`, `playbooks/pause-safely.md` and `skills/show-me-your-work`)

Closest upstream, at 09d06eb: `docs/guide/07-overnight.md` (earning the trust, the contract),
`skills/poteto-mode/playbooks/autonomous-run.md` (the loop, "a plateau is not a stop"),
`skills/poteto-mode/playbooks/pause-safely.md` (the pause and the resume note) and `skills/show-me-your-work/SKILL.md`
with `scripts/log.sh` (the log columns, cleaning cells, the audit of the log against the transcript, "correct the log,
not the story", the Attention section). The structure comes from there; shared text is under 2% (word 6-grams: 5 of
3,152 words of SKILL.md against `07-overnight.md`, 2 against `autonomous-run.md`, 16 of 702 words of AUDIT.md against
`show-me-your-work`, measured on the first draft).

**Problem.** Unattended agent runs end in unchecked work and a story nobody can audit: hours of motion, a goal relaxed
quietly, and no way to tell what was done.

**What this version changes.**
- Written for Claude Code. Cursor's loop and cloud agents become a table of ways to wake a run and what each needs:
  in-turn work, `/loop` and session jobs (they end with the process), an outer shell loop around `claude -p` with
  `--session-id` and `--resume`, a cloud scheduled task (sees only pushed work), Monitor and background Bash, and a
  check-in tool only where the session lists one.
- Trust is a gate: a missing item means no loop, and the reply is a table of what is missing.
- The predicate is `done.sh`, fingerprinted with the files that define it, and counts only on a clean tree.
- A control folder holds the contract, the predicate, the loop script and copies of `log.mjs` and `AUDIT.md`; no turn
  can write it. Turns run in `--permission-mode dontAsk` with one allow rule per command, never `acceptEdits` (which
  approves `rm`, `mv`, `cp` and `sed -i` by mode) and never a bypass. The skill says plainly that deny rules are not a
  boundary (tests, build scripts and commit hooks run code the run can edit) and that the strong protection is a
  user or container with no push credentials; the loop adds a git setting that rewrites every push address.
- The log lives outside the work tree. `log.mjs` refuses a path inside a git work tree, appends one row per call
  without rereading the file, adds an id, a run column (the session id, in place of upstream's `start` rows) and a
  supersedes column, flattens control characters and then guards a cell a spreadsheet would read as a formula, and
  refuses empty fields, bad headers, cut lines and wrong field counts. `log.mjs calls` lists a transcript's tool calls
  with message ids for the audit.
- An off switch file checked on its own, a resume note, and a loop that stops its running turn on a signal.
- Mid-run discoveries are logged and fixed only when they block the predicate.
- The reviewer is a fresh subagent that did not see the run, not a different model family; the Attention section
  reads "reviewed by a fresh subagent that did not see the run", with no model name.
- Stop rules point to `methodology`, one-number runs to `hillclimb`, grading to `evaluator`, each if installed.

**Review and cold run.** The plan check found that `/loop` only wakes a session that stays open. The first review
found that a turn could rewrite its own predicate and log under the documented flags, that `acceptEdits` let `rm -fr`
past a deny rule for `rm -rf`, and that the deny list was presented as a boundary; the cold run, which ran the outer
loop for real, found the morning audit broken end to end (the prompt lost after a variadic flag, the audit file out of
reach, `git -C` commands refused). All were fixed and proven in headless runs. A last probe found that Claude Code
ignores `Write(path)` rules (`Edit` rules cover every file tool), so the skill uses `Edit` rules only.

---

### geppetto, `check-agents.mjs` and the starter roster (Original)

Ideas only, with no shared text or structure, so there is no NOTICE entry. Where each idea came from:
- One bot per job with a named role, an eng lead that never writes code and splits work for engineer bots, and bots
  that test their work before it merges: Peter Yang's episode with Lauren Tan and Peng Zheng on Grok Bot
  (creatoreconomy.so) and his posts about it on X.
- A bot that designs other bots by asking a few preference questions, with "one job, one voice, explicit anti-jobs,
  no leftover tools": Lauren Tan's public bot "dr eggbot".
- Make a new bot only for a distinct goal, tool set, working style, approval boundary or schedule, and start with the
  smallest roster: the Grok Bot docs.
- The name and the covenant: Geppetto and the Grand Covenant in Lies of P, the owner's pick.
- The brief fields in `eng-lead` follow this repository's `lean-subagent-dev` brief, written again in new words, and
  `reviewer` grades claims PASS, FAIL or UNVERIFIED the way `evaluator` does.

**Problem.** Agent files fail silently: a YAML line Claude Code cannot read, a missing name, a misspelled field,
memory that quietly adds Write, or Glob listed next to Bash all make Claude Code skip the file or change the agent's
tools without a word. And claude.ai syncs skills, never agent files, so a roster has to be set up again in every
project and cloud session.

**What it does.** Four modes: Create (a few questions, then one agent with one job, its anti-jobs and the fewest
tools), Install (the bundled roster into `.claude/agents/`, to be committed), Audit (`check-agents.mjs` plus
`claude plugin validate`, then fixes on a yes) and Update (a bundle change merged into tuned copies, never
overwriting one). Every write waits for the user's yes, so it stays off the confirm list. The roster: `eng-lead`
(Read, Grep, Glob, Agent and SendMessage only, so it cannot write code; it plans, then after a yes starts builders
and reviewers in the foreground and returns one fix-round message per builder), `builder` (in a worktree, test first,
commits and never pushes, no memory), `reviewer` (fresh, hostile prior), `writer` (prose only, project memory for
house style) and `sweeper` (lists ignored build output with sizes, deletes only after a yes). Each carries the
covenant from `COVENANT.md`.

**Why.** The owner wanted the batches here to run on named, reusable agents instead of briefs pasted into
general-purpose subagents. The sixth batch's review and cold run changed it in the build: the parser follows Claude
Code's own lenient reading and leaves the last word to `claude plugin validate`; a missing covenant is an error in the
project and a warning for personal agents; the main session sends the fix round, because an agent resumed with
SendMessage runs in the background where `eng-lead` cannot wait for it; `builder` never resets an existing branch
and runs one git command per call; `reviewer` restores a mutated file from its own copy, so uncommitted work under
review is never lost.

## guards

### Inline-backtick guard, `hooks/guards/block-inline-backtick-payload.mjs` (Original)

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

### Merge guard and safe merge, `hooks/guards/merge-guard.mjs`, `skills/guards/safe-merge/safe-merge.mjs` (Original)

**Problem.** With stacked pull requests, deleting the branch of a merged PR makes GitHub close every PR based on it.
`gh pr merge -d` closed two stacked PRs that way. The guard denies every raw `gh pr merge` (it denies too much on
purpose, never too little), and the merge goes through a script that merges pinned to the head commit it read, without
deletion, and deletes the branch afterwards only if no open PR uses it as its base.

**Changes for this release.** The original hard-coded one repository and its two long-lived branches. This version
reads the trunk from the repository's default branch, with environment variables for an expected repository,
promotion pairs (`develop->main`), protected branches and the merge method; it is translated, and the guard's message
prints the script's real path.

**Later changes (2026-10-18).** An idea from pstack's `skills/poteto-mode/playbooks/shipping.md` ("a verdict covers a
patch"), in new words (0 of 520 word 6-grams in upstream): before merging on an older review or evaluator verdict,
compare the patch id (`git -c core.quotePath=true diff-tree -p --full-index` piped to `git patch-id --verbatim`) of the
verdict against the current head's; a different or missing id means the verdict is redone. A review and a cold run
found that `--stable` ignores indentation, that abbreviated blob ids made binary patches differ between clones,
and that promotion and stacked PRs need their own base.

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


### rule-to-hook (Original; since 2026-10-17 adapted in part from [pstack `correct`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct))

Closest upstream for the 2026-10-17 changes: `skills/correct/SKILL.md`, with the idea in
`docs/guide/09-make-it-yours.md`. `SKILL.md` shares about 0.7% of its word 6-grams with `correct` (29 of 4,403); the
structure taken is `correct`'s fix order (architecture, types, a lint or CI check whose error names what to use
instead, a test, prose last), the ratchet ("fail only when a change adds more"), proving each check on a real past
mistake, exceptions on the offending line with a reason, an expiry and a human's approval, the rule table, and the
reply line on why a higher layer did not work. `agent-friendly-audit` was adapted from the same skill and finds the
rules; this skill implements one, with the same fix order and exception fields. `templates/ratchet.mjs` and the rest
of the skill are mine.

**Problem.** Rules written in CLAUDE.md, AGENTS.md or a style guide get broken again and again while they are still
written down, and rewriting the sentence does not help. When someone finally turns a rule into a hook, they often
guess at the hook contract, block harmless near-misses until the guard gets switched off, crash closed on unexpected
input, or ship a test that has never been seen to fail. The skill makes the conversion a repeatable process: real
examples first, a deliberate choice of mechanism, a pure decision function with a DENY/PASS test table, a proof that
the test can fail, a live check, and a pointer from the rule to what now enforces it.

**Changes for this release.** None; written for this release.

**What this version changes (2026-10-17, from pstack `correct`).**
- Step 2 tries the layers in order before picking a mechanism: architecture (make the rule unnecessary), types, a lint
  or CI check, a test, prose. A Claude Code hook is the layer for rules about what the agent does; a rule about the
  code goes in its own lint, types or tests, with a hook at most as a second layer. `correct` has no hook layer; it was
  written for Cursor.
- Every hook reason, lint message and CI error names what to use instead, with the message settings of ESLint, Ruff,
  Clippy and golangci-lint `forbidigo`. A linter rule that parses the code is preferred over a regex.
- A pattern already common gets a ratchet: ESLint bulk suppressions, `ruff check --add-noqa`, golangci-lint
  `--new-from-*`, or the new `templates/ratchet.mjs` (Node 20+, any language's files). It runs from the repository
  root, counts matching lines in files chosen by git globs (`:(exclude)` for a file that is allowed), compares the
  count with a committed baseline number, fails when a change adds one, asks for the baseline to be lowered when it
  drops, refuses globs that match nothing, and lists every exception on each run for review.
- Exceptions go on the offending line with a reason, an expiry date and an approver recorded by role or handle; the
  check fails on an expired or incomplete one (`ratchet.mjs` does). A script cannot tell who wrote the approval, so
  code review is the human gate.
- Each layer has its own test, proof and record: architecture and types prove with the case that no longer builds and
  get no row; a ratchet has a table of lines that must and must not count plus the baseline cases.
- Step 4 puts the file from before a real past fix into today's tree (`git show <sha>^:<path> > <path>`), runs the
  check, and restores it, besides the mutation. `correct` asks for the past mistake; the mutation stays from the
  earlier version.
- Step 5 adds a CI live check for lint, CI and test enforcers, and a rule table pairing each rule with its enforcer and
  exceptions. `correct` drops a rule once its mistake cannot happen, and the earlier version never deleted it: now the
  sentence stays while an enforcer exists and goes only when architecture or types make the mistake impossible.
- The report gains a Layer line with why each higher layer did not work, a Ratchet line and a Past mistake line.

**Why.** Backlog item M2. A hook enforces nothing for humans and CI, so a code rule enforced only by a hook was a weak
default, and a rule that already had hundreds of live instances could not be enforced at all without a ratchet. The
review and a cold run on a Python fixture found that `ratchet.mjs` run from a subfolder would ask for the real baseline
to be lowered to the subfolder's count, that a glob matching nothing gave a check that could never fail, and that a
permanently allowed file could not be left out; all three are fixed and tested.


### dependency-upgrade (Original)

**Problem.** Agents asked to "update dependencies" tend to bump many majors at once, regenerate the lockfile wholesale
and fix whatever breaks. The result is one large commit that cannot be bisected or partly reverted, with transitive
upgrades nobody reviewed. Upgrades started on a failing baseline cannot be judged at all, and version numbers recalled
from memory are sometimes wrong or not yet released. The skill makes the safe order explicit: baseline first, research
from primary sources, toolchain before frameworks, one major per commit, and a report of what was skipped or blocked.

**Changes for this release.** None; written for this release.

### Secret guard, `hooks/guards/secret-guard.mjs` (Original)

**Problem.** An agent handed a key to get something working pastes it where it is used. From there it reaches a
commit, and a pushed key has to be rotated even after the commit is reverted. The guard checks the text being written,
by known token formats and by random-looking literals assigned to secret names, and leaves `.env` files alone.

**Changes for this release.** None; written for this release.

### Destructive guard, `hooks/guards/destructive-guard.mjs` and `hooks/lib/shell.mjs` (Original)

**Problem.** Each command it blocks has a well-known story: `rm -rf "$DIR/"` with an empty variable, a force push
over shared history, `git reset --hard` over hours of uncommitted work, `git clean` on files git never stored. The
guard checks git state only when it matters, so ordinary cleanup on a clean tree still passes. `shell.mjs` splits a
command line into simple commands, including `sh -c` payloads, so guards can tell which program a flag belongs to.

**Changes for this release.** None; written for this release.

### No-verify guard, `hooks/guards/no-verify-guard.mjs` (Original)

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
- With only a goal and no plan, it suggests running `/brainstorm` first; without it, it asks for two or three ways to
  reach the goal before grilling one, and grills the user's idea if they decline.
- It asks each question with the session's question tool when it has one, recommended answer first. With three or
  more decisions open at once it offers one `html-plan` page to answer them together, as its own question first, if
  it is installed; the page's answers feed the next branch, never a build.

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
- After saving, it offers to render the spec as an `html-plan` page with its open decisions, if it is installed. The
  markdown PRD stays the spec; the page's answers update it, never start a build.

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

### improve-codebase-architecture (Adapted from [`improve-codebase-architecture`](https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture) and pstack [`design-red-flags.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/architect/references/design-red-flags.md), `architect/SKILL.md`, `principle-minimize-reader-load`, `principle-model-the-domain` and `poteto-mode/playbooks/refactoring.md`)

Closest upstream: `SKILL.md` 2026-04-28 to 2026-05-27; `LANGUAGE.md` and `INTERFACE-DESIGN.md` 2026-04-24 to
2026-06-10. `LANGUAGE.md` is essentially upstream's (97% of its 6-grams), trimmed.

**Later changes (2026-10-18, from pstack at 09d06eb).** 85 of 1,464 new word 6-grams (5.8%) appear in pstack: 23 in
`architect/SKILL.md` (the agent-contributor sentence), 22 in `design-red-flags.md` (the flag names and two
definitions), 18 in `principle-minimize-reader-load` (the 30-second test), 15 in `principle-model-the-domain` (the
boolean sign and "do not force an abstraction"), 8 in `refactoring.md` ("type check and lint are not a pin"). The new
`SKILL.md` lines share 11.4%, `EXECUTION.md` 1.0%. What this version changes against those files:
- Seven of upstream's eight red flags, as one-line bullets in this skill's vocabulary, used in Explore to find
  candidates rather than to screen sketches (shallow module was already in the friction questions).
- The reader-load test, scored as a net change; upstream's six bullets are dropped.
- From model-the-domain, only the signs and the "boring code" line; each candidate names what it removes.
- A step 4, Execution (`EXECUTION.md`), only on an explicit ask to implement and a yes to the decisions left open, on
  a clean tree and its own branch: a characterization pin at the nearest interface the change leaves in place,
  committed and proven able to fail (with `tdd` or `mutation-test` if installed, by hand otherwise), small green
  steps, callers migrated and the old path deleted in one wave within the change, with stored names, queued jobs,
  rolling deploys and outside callers left to the user, and before and after reader-load counts. Upstream's
  subagent delegation, separate target-shape and subtract steps and rebase and pull request step are dropped.

**What this version changes.**
- Self-contained: links to files that are not part of it are removed (`DEEPENING.md`, and `CONTEXT-FORMAT.md` and
  `ADR-FORMAT.md` in another skill).
- It no longer requires the Explore subagent.
- `CONTEXT.md` and `docs/adr/` are used if they exist.
- `INTERFACE-DESIGN.md` generates three or more designs inline under named constraints (minimize the interface,
  maximize flexibility, optimize the common caller, ports and adapters), instead of spawning parallel subagents.
- Each key principle gets a one-line explanation.
- A Rules section: no code before step 4 (no code at all before 2026-10-18), domain language first, respect ADRs, be
  opinionated.
- Broader trigger phrases.

**Why.** I run it in sessions and tools where subagents and the sibling skills are not available.


### architect (Adapted from [pstack `architect`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/architect))

Closest upstream: `skills/architect/SKILL.md` and its `references/design-red-flags.md`, `runner-prompt.md` and
`rationale-template.md`. Shared word 6-grams: `SKILL.md` 7%, `RED-FLAGS.md` 23% (the same eight flags and headings,
prose rewritten), `SKETCH-BRIEF.md` 3%, `RATIONALE-TEMPLATE.md` 5% (the same section list).

**Problem.** Jumping straight to code fixes the shape before anyone has compared it with another one, and agent
contributors then copy whatever shape exists.

**What this version changes.**
- The sketch phase no longer requires arena: by default it writes two sketches in sequence; for a larger design it
  runs `arena` if that is installed (since P0.5; before, `arena` was typed and the skill suggested the user run it),
  or briefs two subagents. With an arena result, Screen runs only the red flags.
- Grounding uses `codebase-oracle` if it is installed, instead of pstack's how and why skills.
- A table of not-implemented stubs for 13 languages.
- Screen is its own phase, with the deletion test and the agent-contributor test; the red flags gain the vocabulary of
  `improve-codebase-architecture/LANGUAGE.md` and ways to make internals unreachable per language.
- Agree is optional, with explicit triggers, through AskUserQuestion. Implement uses `tdd` if it is installed, with
  an inline fallback; deviations go into a new Deviations section of the rationale, which is saved next to the
  project's design documents.
- The scrap signals are kept; the new sketch must be smaller than the old one.
- When Agree stops for the user, it offers to show the design as an `html-plan` page with the open questions as
  decisions, if it is installed. The page's Respond text is data.

**Why.** The design step should work in a plain Claude Code session with only this skill installed.

### brainstorm (Original)

Ideas from pstack, with no shared text or structure (0 of about 2,500 word 6-grams): "loosen constraints that don't
serve the goal as readily as you add ones that do" from [`sharpen`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/sharpen) became the hard and assumed
constraint sort and the "remove the biggest constraint" lens; settling an empirical fork by trying it, from the
[prototype playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/prototype.md), became the throwaway prototype in Converge. Side
by side prototypes also appear in upstream's `principle-exhaust-the-design-space`. Separate briefs per lens follow this
repository's `arena`.

**Problem.** Interviewing a plan narrows it. Starting with `grill-me` when there is only a goal locks in the first
idea before any alternative exists, and one model's ideas tend to cluster around that first idea.

**What it does.** Frame in at most three questions asked together, each with proposed answers. Diverge through named
lenses, used internally, into 8 to 12 options in 3 or 4 clusters. One round of picks: the agent's are marked
(Recommended) with a reason each and accepted with a tap or an "ok"; without a question tool the user types marks,
and "blind" holds the picks back. Converge on 3 or 4 options weighed without a score after the facts are settled,
with a one-line premortem each, and hand a short summary to `grill-me`. The flow is the owner's design, written for
Claude Code (AskUserQuestion when the session has it, the Agent tool for optional per-lens subagents).

**Why.** The owner asked for a step before `grill-me`: widen, then settle. The cold run on a real question in this
repository reached a full summary; the review round fixed a subagent brief that withheld the constraints its lens
needed and ratings made before the facts were in. The sixth batch made it lighter (Q9) after the owner used it on Q6:
held-back picks cost two round trips, and typed marks over two rounds were fiddly. In a scripted comparison it reached
a decision in 4 replies instead of 5, with about a third less output.

### sharpen (Adapted from [pstack `sharpen`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/sharpen))

Closest upstream: `skills/sharpen/SKILL.md`, `skills/in-your-own-words/SKILL.md` and
`skills/poteto-help/references/prompting.md`. The body shares about 25% of its word 6-grams with them (16% from
`sharpen`, 9% from `prompting.md`).

**Problem.** Agents start on the literal wording of a task, miss what the user is after, and add constraints instead
of questioning the ones that do not serve the goal.

**What this version changes.**
- The upstream paragraph becomes numbered steps; the `in-your-own-words` restatement (the goal, the problem behind it,
  and why) is the first.
- A confirm step is added on purpose. Upstream works "without narrating the framing"; here the agent confirms in a
  fixed six-line shape (Goal, Why, Outside check, Missing, Loosen or add, Your call) with AskUserQuestion or a plain
  question, then works. The lines check understanding; they are not a new prompt, and "don't hand back a rewritten
  prompt" is kept.
- The prompt checklist from `prompting.md` is inline: put in the goal, the done check, the proof, the known facts and
  the constraints; leave out the how, a list of skills or steps, and the user's theory of the cause until the agent
  restates the problem. Its mentions of `/recall`, `/how`, `/why`, `/teach` and `/loop` are dropped.

**Why.** The dry run on backlog item M3 showed that without a fixed shape the confirm ran to about 20 lines.

### agent-friendly-audit and `mine.mjs` (Adapted from [pstack `correct`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct))

Closest upstream: `skills/correct/SKILL.md`, with ideas from `skills/automate-me/SKILL.md` (parallel slices, no glob
across projects), `docs/guide/09-make-it-yours.md`, `skills/architect/references/design-red-flags.md`, and the
author's post on X from mid-October 2026 (an inverse pyramid of effort: the codebase first, then static analysis, then
prose, and least of all human review). `SKILL.md` shares about 3% of its word 6-grams with them; the structure is
`correct`'s (the fix order, proving each check, exceptions with a reason, an expiry and an approver, the rule table, "a
class counts once it has happened twice", and the sentence about agent contributors). `SLICE-BRIEF.md`,
`PLAN-TEMPLATE.md` and `mine.mjs` are mine.

**Problem.** The same agent mistakes get corrected again and again in review and in chat, and each fix lands as one
more sentence in an instruction file that nothing enforces.

**What this version changes.**
- `correct` fixes the top classes at once, one commit each. Here that is a proposal: a plan backed by counts, and
  nothing is written until the user says yes.
- Evidence comes in four named slices (review comments through the GitHub MCP tools or `gh api` REST, commit history
  on the default branch, this project's Claude Code transcripts and memory, the instruction files), mined by read-only
  subagents with a bundled brief, or in turn without them.
- Confidence levels are new: two or more sources make a class high confidence (upstream `automate-me`'s "2+ slices"
  means time slices of transcripts). Live copies count toward a class but not toward confidence. Rules for empty or
  bot-only slices, for too little evidence (propose nothing), and for classes already enforced.
- Each proposed check is proven in a scratch folder against `git show <sha>^`; a pattern with live copies becomes a
  ratchet; a check that allows exceptions must fail on an expired one. Open questions are answered with a prototype.
  The prompt is confirmed first, with `/sharpen` as an optional extra.
- Privacy rules are new: pointers instead of raw excerpts, synthetic inputs for proofs, approvals recorded by role or
  handle, never a person's name.
- `mine.mjs` is new and read only: `commits` lists fix and revert commits with their files; `transcripts` prints only
  what the user typed, reads only this repository's transcript folders, leaves out the live session, and redacts
  emails, tokens, keys and URL credentials; `folders` finds the folders and shows home paths as `~`.

**Why.** The backlog item and the post's recipe: put the effort where it holds without agent judgment, back it with
data, and keep secrets out of what gets written. The review round found that secrets in environment-variable form
(`GITHUB_TOKEN=...`) printed unredacted and that `transcripts` would read any project's folder; both are covered by
tests now. The cold run on this repository found live instances of two classes in existing code.

### engineering-principles (Adapted from pstack [`poteto-mode`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode) "Principles", the `principle-*` skills and `docs/guide/08-principles.md`)

Closest upstream, at 09d06eb: `skills/poteto-mode/SKILL.md` (the Principles index and the citation rule in
Non-negotiables), `docs/guide/08-principles.md` (steering with names), and `skills/principle-{build-the-lever,
explain-the-number, make-operations-idempotent, type-system-discipline, boundary-discipline, model-the-domain,
minimize-reader-load, separate-before-serializing-shared-state, subtract-before-you-add, laziness-protocol,
migrate-callers-then-delete-legacy-apis, redesign-from-first-principles, experience-first}/SKILL.md`. Also three rules
from `skills/typescript-best-practices/SKILL.md`, one phrase from `skills/poteto-mode/playbooks/refactoring.md`, and the
two-line debugging fallback from `principle-fix-root-causes` and `principle-attack-the-premise`. Text upstream cut as
unneeded is restored only where a kept principle needs it: from e5136d8 (parent of 99743e9, pull request 634) for
type-system-discipline and migrate-callers-then-delete-legacy-apis; from ea32d95 (parent of 08bd59b, pull request 571)
for laziness-protocol; from d73344b (before 00b14f1) for the per-language idioms of type-system-discipline and the "why"
of subtract-before-you-add. Shared word 6-grams (the share of each file's distinct 6-grams, lowercased with punctuation
removed, that occur in any file of pstack at 09d06eb or in the restored texts from e5136d8, ea32d95 and d73344b):
`PRINCIPLES.md` 13.8%, `SKILL.md` 4.6% (the index structure; prose new).

**Problem.** Twenty-four principle skills cost a listing entry each and are hard to steer with. One index the user can
name from, plus a rule that a citation names the decision it changed, keeps the vocabulary without the cost and without
name dropping.

**What this version changes.**
- One skill instead of 24 principle skills: an index in `SKILL.md` (when it applies, the rule, the sign you skipped it)
  and one section per principle in `PRINCIPLES.md` under the same name. A test keeps the names and order in step.
- Eleven principles kept. Skipped: encode lessons in structure (this repository does it), exhaust the design space (in
  `arena`), guard the context window, never block on the human and outcome-oriented execution (they contradict
  `grill-me` and `migration-review`), foundational thinking, and prove it works, sequence verifiable units and test
  behavior not implementation (in `tdd`, `bug-fix` and `evaluator`). Attack the premise and fix root causes are one line
  that offers `bug-fix`, with a fallback.
- The citation rule applies per citation. The standing "in your reply, name each principle" of poteto-mode is dropped.
- Links to other pstack skills become our skills "if it is installed" (benchmark-checklist becomes `hillclimb`'s
  checklist, plus `skill-eval` for eval numbers), each with enough inline to work alone.
- Build the lever: "commit the lever" becomes "the lever belongs in the change". A delegate skill becomes a file the
  delegates read. Syntax-aware edit tools are listed per ecosystem.
- Make operations idempotent: worked examples (a lock that records its process id, convergent forms) and a pointer to
  `migration-review`.
- Type system discipline: the "make illegal states unrepresentable" and "don't lie to the type system" text cut at
  99743e9 is restored. TypeScript-only wording becomes idioms from several languages. boundary-discipline is folded in,
  with "boundary" replaced by "the seam where outside data enters". Three rules come from `typescript-best-practices`
  (simplest total type, schemas before guards, a type guard checks what its name says), each with a dynamic-language
  form.
- Subtract before you add absorbs the laziness protocol, and says how it meets redesign: "the smallest change that
  reaches the target shape".
- Migrate callers then delete: the rule cut at 99743e9 is restored. It adds the callers one change cannot reach (a
  published library, names stored in data, jobs queued by name, rolling deploys) and offers `migration-review`. Deleting
  tests that pin old internals goes through the two-edit check of `tdd` if it is installed.
- Separate before serializing shared state keeps `parallel-worktrees`'s split: an owner per file is fine; other shared
  state is separated or locked.
- Redesign from first principles works within recorded decisions (ADRs) and delivers in steps.
- Experience first: "delight" becomes the experience of whoever consumes the work, and "throwaway HTML" becomes a
  throwaway prototype.

**Review and cold run.** A fresh reviewer found idempotency examples that do not hold (a lock that records only a
process id, `CREATE TABLE IF NOT EXISTS` as convergent, a temporary file in another folder), a step that set a rule
for the rest of the session, and a lever and a subtraction with no scope; all fixed. A cold run of 14 headless
sessions holding every skill here found no collisions with `architect`, `improve-codebase-architecture` or
`brainstorm`, and the skill started on a named principle but not on its own for a design question.

---

## Not published

| Skill | Finding from the diff | Where it is listed |
|---|---|---|
| grill-with-docs | Abridged copy of upstream `grill-with-docs` (2026-04-28 to 2026-04-30; 73% of 6-grams shared). The changes are removals (example trees, the CONTEXT-FORMAT and ADR-FORMAT references) plus trigger phrases and one paragraph relating it to grill-me. | README, "I also use, unmodified" |
| prototype | Abridged copy of upstream `prototype` (2026-05-06 to 2026-07-10; 84 to 86% of 6-grams in `SKILL.md` and `LOGIC.md`). The changes condense upstream text; the only addition named an issue tracker. | README, "I also use, unmodified" |
| bro | No shared text with upstream `wait-what` (0 of 264 6-grams), but it carries a `license: MIT` line and a Portuguese-language rule that suggest another source I have not found. Left out until its origin is known. | Not listed |
