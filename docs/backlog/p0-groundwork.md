# P0. Groundwork (do first)

[Back to the backlog index](../BACKLOG.md)

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

**P0.5 Every skill loads on its own** (`done`, orchestrator plus builders, touches every skill). Decision 7.

Why. Typed skills cost the owner effort: they must remember each skill's name and what it does. A skill the agent can
start from the user's own words ("help me brainstorm", "close the session") is used more. The tier limits came from
decision 4, when the whole skill listing was over budget; measured on 2026-10-17, the 12 auto descriptions take 4,590
characters (about 1,150 tokens) and the 22 typed ones would add 14,136 characters (about 3,500 tokens) as written.

The budget to design for. Claude Code gives the skill listing about 1% of the context window: about 8,000 characters
on a 200k window, about 40,000 on a 1M window. Over budget, it drops the descriptions of the least used skills and
keeps only their names. The owner's account also carries roughly 170 skills from other plugins (sales, legal, finance,
human resources, marketing, product management, operations, design, engineering, data, customer support, enterprise
search, Common Room, Apollo, brand voice, Slack, productivity, Cowork plugin management). In the session that planned
this item, several of this repository's skills, auto ones included (`bug-fix`, `verify-app`, `evaluator`), showed as
bare names with no description: Claude Code had already cut them for space. So this item has two halves: shorter
descriptions here, and fewer plugins in the owner's account.

Step 0, before any edit (the owner, in a fresh session): run `/context` and report the line for skills (tokens) and
the model's context window. That is the baseline, and it says which budget applies (8,000 or 40,000 characters).

Part A, the repository:
1. **Remove `disable-model-invocation: true` from all 22 typed skills.** Keep their `argument-hint`.
2. **Rewrite every description, all 34, as a trigger list.** One sentence on what it does, then the phrases a person
   would actually say. Targets: at most 300 characters each and at most 9,000 in total, so all 34 fit the 200k-window
   budget on their own (34 x 265 is about 9,000). If step 0 shows a 1M window, 400 each and 12,000 in total are fine;
   decide from the measurement and write the numbers into the test. Keep the most used trigger phrases (decision 6),
   drop restated detail that the body already has, and keep the claude.ai upload rules (under 1,024 characters, no
   angle-bracket tag). Watch for collisions with the owner's other plugins, which have `product-management:brainstorm`,
   `engineering:code-review`, `engineering:debug` and `engineering:testing-strategy`: each description should say what
   makes this one different (for example `brainstorm` widens options before `grill-me` narrows them).
3. **Add a confirm step to the skills that cost something when the agent starts them on its own.** A short paragraph
   near the top, the same words in each: "If you started this skill on your own, without the user typing its name or
   asking for it, first say in one or two lines what it will do and what it will cost, and wait for a yes. If the
   user asked for it, go ahead." The list, to settle in the batch's plan check:
   - launches subagents or headless runs: `arena`, `skill-eval`, `hillclimb`, `agent-friendly-audit`,
     `parallel-worktrees`, `brainstorm` (when it uses subagents per lens), `verify-app` (create and maintain modes),
     `codebase-oracle` (already states the cost before explorers; make its wording match);
   - takes over the session or sets a way of working: `lean-subagent-dev`, `methodology`, `grill-me`;
   - writes or commits outside the conversation: `session-close`, `handoff`, `project-setup`, `retrospective`,
     `instructions-audit` (when it edits), `rule-to-hook`, `dependency-upgrade`, `ci-cost-and-cadence` (when it
     builds), `improve-codebase-architecture`, `to-issues` (when it files issues).
   Read-only and advisory skills (`which-skill`, `tdd`, `bug-fix`, `review-triage`, `evaluator`, `mutation-test`,
   `migration-review`, `flaky-test-hunt`, `dependency-security-audit`, `safe-merge`, `sharpen`, `to-prd`, `architect`)
   do not ask; they already act only on what the user asked for. `safe-merge` keeps its own confirmations.
4. **Rewrite every mention of a typed skill.** "Suggest the user run `/<plugin>:<name>`" becomes "use `<name>` if it is
   installed", now that any skill can start another. `tests/standalone.test.mjs` still needs "if it is installed" in the
   same paragraph. This makes P1.4 moot; close it.
5. **Tests.** `tests/context-budget.test.mjs`: drop the 12-skill cap, set the per-description and total limits from
   step 2, and fail if any skill still has `disable-model-invocation: true` (a ratchet at zero). New: a test that every
   skill on the confirm list carries the confirm paragraph word for word, and no other skill does, so the list cannot
   drift. Prove both with `mutate.sh`.
6. **Tooling and docs.** `scripts/new-skill.mjs` stops writing `disable-model-invocation: true` and its test follows;
   `docs/ADDING-A-SKILL.md` step 2 describes the new rule (short trigger description, confirm paragraph when the skill
   costs something); README "What loads on its own" becomes one list plus the confirm list; `which-skill` drops its
   tier split; the "Context budget" policy here is replaced by "Policy after P0.5" below; CLAUDE.md if it mentions
   tiers. Fixtures under `tests/fixtures/` that use the flag on purpose stay as they are.
7. **Versions.** Minor bump for every plugin and the bundle; `pau-skills-hooks` only if a hook changed (none should).

Policy after P0.5: every skill is model-invocable; descriptions are trigger lists within the limits the test sets;
skills that spend, take over or write ask first when the agent started them; the listing is measured with `/context`
after each upload.

Part B, the owner's account (no repository change; done together in the session):
1. List the plugins installed for the owner and how many skills each adds, from the session's own skill listing.
2. Sort them into keep, maybe and remove, from what the owner actually uses. A first guess from this session: the
   owner works on software and on this repository, so `sales` (about 40 skills), `legal`, `finance`,
   `human-resources`, `marketing`, `common-room`, `apollo`, `brand-voice`, `customer-support` and `slack-by-salesforce`
   are likely removals; `engineering`, `design`, `data`, `productivity`, `product-management`, `operations` and
   `enterprise-search` are maybes. Many of their connectors also fail in cloud sessions (proxy 403), so they add names
   without working tools. The owner decides each one.
3. The owner turns them off where they were installed (claude.ai, Customize; or the organization's plugin settings).
4. In a new session, `/context` again: the skills line should drop, and every skill here should show its description.

Shipping. Every skill's frontmatter changes, so all 34 are re-uploaded once: `node scripts/pack-skills.mjs --all` on
main after the merge, then replace each skill on claude.ai (none is new, none is removed). Then a new session confirms
the sync (`ls ~/.claude/skills/synced/*/<name>/`), runs `/context`, and tries a few plain requests ("let's brainstorm
options for X", "wrap up this session", "is this test any good") to see the right skill start, with a confirm question
where the list says so.

How to run it. As a batch ("How to run a batch"), with builders split by plugin group so each touches disjoint files:
session-discipline, verification, agent-orchestration with guards, and planning. The orchestrator owns the tests in
step 5, the tooling and docs in step 6, versions, README, which-skill and this file, and writes the confirm paragraph
once so every builder pastes the same words. Each builder rewrites its descriptions, removes the flag, adds the confirm
paragraph where the list says, and fixes typed-skill mentions in its own folders. Review: one fresh reviewer over all
descriptions for collisions and lost triggers, and a cold run that sends ten plain requests to a headless `claude -p`
holding only this repository's skills and checks which skill each one starts.
