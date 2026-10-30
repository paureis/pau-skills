# Decisions

[Back to the backlog index](../BACKLOG.md)

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

7. **Every skill loads on its own (2026-10-17, replaces the tier limits of decision 4).** The owner finds typed
   skills hard to use: they have to remember each name and type it. So every skill becomes model-invocable, and the
   context cost is kept down by short descriptions instead of by a small auto tier. Skills that launch subagents or
   paid runs, take over the session, or write outside the conversation first say what they will do and what it costs,
   and wait for a yes, when the agent started them on its own. Typing `/name` still works for every skill. Item P0.5
   does it.

## Decisions taken (2026-10-19)

8. **Open questions settled after the fifth batch**, each as recommended:
   - The description total is 13,000 characters (was 12,000), so new skills fit without trimming others.
   - `evaluator` may grade an assertion PASS on a live call to a function while it reports the shipped test as a
     test-integrity defect: the contract held, and the weak test is not hidden.
   - `engineering-principles` keeps its description. It starts when a principle is named; a stronger cue would start
     it on routine design questions.
   - `overnight-run` is adapted from pstack (the rule is "text or structure"), and so is `lean-subagent-dev`, whose
     `TRIAGE.md` ships pstack text.
   - `lean-subagent-dev` keeps its effort split per role (builder `high`, plan checker and reviewer `xhigh` on a
     generous budget): in the fifth batch every plan check and review found a real problem.
   - `tdd` keeps a separate `metadata.upstream-pstack` key for its second upstream.
   - The `rule-to-hook` ratchet keeps failing when the count drops until the lower baseline is committed, which locks
     the progress in.
   - The test count on the profile README waits for Q1: the owner wants the number to count tests that are worth
     having.

9. **Settled at the start of the sixth batch**, each as recommended:
   - The description total is 14,000 characters (was 13,000). The batch would have landed near 12,940, with nothing
     left for later batches; on the owner's 1M window the extra 1,000 characters cost about 250 tokens a session.
     New descriptions still aim at about 330 characters.
   - `builder` carries no memory: under `isolation: worktree`, `memory: project` writes into the worktree (seen on
     2.1.303), where it is lost or committed on the branch.
   - The owner sets `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to 3 in the cloud environment (it was 1, which turns
     nesting off). `eng-lead` still works at depth 1: it plans and briefs, and the main session starts the builders.
   - html-plan was not installed in the session that ran the batch, so its decisions went out as plain text.

10. **Settled after the sixth batch (pull request 28)**, each as recommended except the last:
   - A personal agent in `~/.claude/agents/` without the covenant stays a warning; the covenant is an error in the
     project and for any roster file.
   - `eng-lead` drops SendMessage: the main session sends the fix rounds. The roster goes to version 2.
   - `check-agents.mjs` gives a validate command that works for a folder not named `.claude/agents`.
   - The launch-readiness secret check keeps flagging long camelCase names with digits; evidence cites `file:line`.
   - A probe that fails on purpose: the agent offers the framework's expected-failure form as the recommended answer
     and leaving it failing as the other.
   - The three problems found before the batch (verify-app's skipped report block and source wave, `to-prd` step 2
     asking the user) are fixed in the same follow-up pull request, not filed as issues (the owner's choice).

11. **Settled after Q4 (pull request 33)**, each as recommended, on an html-plan page:
   - The file-size guard sees only Write, Edit and MultiEdit; a file written by a Bash command stays a documented
     gap, which the repository test catches in CI. No Bash check is planned.
   - The nine files between 18,000 and 20,000 bytes are split when an edit needs it; the hook asks then.
   - `rule-to-hook` gets `allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)`, so reading its own reference files does not
     prompt.
   - The test gaps the Q4 reviews found, all present before the batch, go into Q10.

12. **Settled after Q10 (pull request 38)**, each as recommended, on an html-plan page:
   - `instructions-audit` gets `allowed-tools: Read(~/.claude/CLAUDE.md), Read(~/.claude/rules/**)`, so the user-level
     files are read without a prompt; in every Q10 cold run those reads were refused and a contradiction between the
     user-level and project files was missed. Proven with one more cold run: with `Skill(instructions-audit)` allowed,
     both reads succeeded and the report found that contradiction. A headless run that does not allow the skill now
     cannot load it, as for every skill with `allowed-tools`.
   - Its SKILL.md says that a path with a slash and no file extension is reported only when its first folder exists,
     so the agent checks the others by hand.

## Decisions taken (2026-10-23)

13. **Settled after batch 8 (pull request 41)**, each as recommended, on an html-plan page:
   - `project-setup` sends its introduction alone, asks "Shall I start?" and ends its turn; it reads the project only
     after the user answers. Stronger wording alone did not put the introduction first (0 of 3 one-turn runs); this
     did (3 of 3), at the cost of one more reply.
   - Rule 2 of `PRODUCTION-RULES.md` gains "look up a key that comes from input only in a fixed list or a Map", after
     the batch 8 cold run kept a NaN total from `CATALOG[sku]` with `sku` set to `constructor`. The four copies
     change together, and the roster number goes up, since the block in `builder` and `reviewer` changes.
   - The check ids stay only in the table after the block, as built.
   - One follow-up item, Q11, holds these and the headless gaps (launch-readiness's area reads after `--resume`,
     geppetto Create's scratch folder, eval scenarios for project-setup's Q8).

## Decisions taken (2026-10-24)

14. **Settled after Q11 (pull request 44)**, each as recommended, on an html-plan page:
   - project-setup leaves `printenv` and the read of `~/.claude/CLAUDE.md` as they are: after `--resume` in a
     headless run both are refused, and the setup goes on without them.
   - launch-readiness keeps reading, in step 1, the areas it leaves out on a guess (about 48 KB for a web app): that
     is what let a later correction work without a refused read.
   - `verify-app` and `agent-friendly-audit`, which keep scratch files outside the project, go into a follow-up item,
     Q12.
   - The two eval gaps (`grade.mjs`'s own main guard through a symlinked path, and the 30-turn limit that
     spanish-beginner reached) go into Q12 too.
   - The owner uploaded the four Q11 zips (geppetto, launch-readiness, project-setup, rule-to-hook), and they synced.

15. **Settled after Q12 (pull request 47)**, each as recommended, on an html-plan page:
   - The project-setup eval persona gets a stricter end rule, in a follow-up item, Q13: `spanish-beginner` used all 40
     turns because the persona went on with its first task instead of sending `[END]`.
   - The other skills that keep files outside the project on purpose (`hillclimb`, `overnight-run`, `arena`,
     `bug-fix`, `brainstorm`, `architect`, `evaluator`, `skill-eval`, `retrospective`) stay as they are.
   - agent-friendly-audit's SKILL.md (19,729 bytes) is split when an edit needs it, as decision 11 says.
   - A headless verify-app maintain pass that cannot reach its live pass stays as it is: an interactive session asks.

## Decisions taken (2026-10-25)

16. **Settled after Q13 (pull request 50)**, each as recommended, on an html-plan page:
   - The project-setup eval's default `--out` moves to a folder under the system temp folder, in Q14: inside the
     repository, every run's assistant, persona and judge read this repository's CLAUDE.md.
   - The eval's printed cost adds the persona's and the judge's calls, in Q14.
   - The owner asked for a new item, Q15: rework the look of html-plan pages, which are hard on the eyes. In dark mode
     the page showed light text on a white background, and the contents rail went white on white on hover.

17. **Settled after Q14 (pull request 55)**, each as recommended, on an html-plan page:
   - The project-setup eval keeps stopping, before any model call, a run whose output folder is inside the repository;
     it does not only warn.
   - It keeps refusing an output folder with a `CLAUDE.md`, `CLAUDE.local.md` or `.claude/CLAUDE.md` in it or in any
     parent folder, which the Q14 review added for a worktree inside another checkout.
   - Nothing comes next for now: no paid eval round and no new item. The backlog stays empty until the owner adds one.

## Decisions taken (2026-10-26)

18. **The next batch, Q16**, from a brainstorm of eleven options and an interview, each as recommended:
   - Build a trigger test suite and a skill usage log together; leave the breaking-change check skill as the
     runner-up.
   - The suite is a mode of `skill-eval`, so anyone can test their own skills' triggers.
   - This repository's request lists live in `evals/triggers/`, one per skill: 3 requests that should start the skill
     and 2 near misses. An agent that has not seen the descriptions writes them, and the orchestrator checks them.
   - Trigger runs see only the skills under test, under an empty HOME.
   - 2 repeats per request; the first full round has a cap of 40 US dollars, and its summary is committed as the
     baseline.
   - The usage log is on by default and records names, times and how a skill started, never the prompt; the report
     is asked for through `which-skill`.
   - The batch measures only; fixing misfiring descriptions is a follow-up item.

## Decisions taken (2026-10-30)

19. **Settled after Q16 (pull request 59)**, each as recommended, on an html-plan page:
   - A near miss counts as right when the named skill or no skill starts: the round measures misfires of the skill
     under test. The report also says how many near misses started the named skill.
   - Before any description is reworded, the 41 baseline misses that looked around the empty folder run again with
     two turns (approximately 4 to 7 US dollars), to tell the one-turn limit from a weak description.
   - A follow-up item, Q17, rewords the weakest descriptions and measures them with `--baseline`.
   - The owner checks the skill-usage hook's real inputs after the update, for free, instead of a paid headless run.
   - A round whose run passes its hard stop goes on and reports any amount above the cap, with exit 1.
