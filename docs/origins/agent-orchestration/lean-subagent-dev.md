# lean-subagent-dev (Original; `TRIAGE.md` adapted, ideas from [pstack poteto-mode](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode))

Back to the [origins index](../../ORIGINS.md).

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
adapted text is in `TRIAGE.md`, the identical copy of [review-triage's](../verification/review-triage.md) (see there). What this version changes:
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

**Q23 (ponytail).** `TRIAGE.md` is a copy of review-triage's and carries the same rules taken from
[ponytail](https://github.com/DietrichGebert/ponytail/tree/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846) (MIT); see
`docs/origins/verification/review-triage.md`. The fix-round line names the one test exception, for a pure deletion.

**Q24 (2026-11-18).** From the Claude Code team's article on verification (claude.dev blog, 2026-11-16), ideas only, no shared text. Its copies of `review-scope.mjs`, its modules and `TRIAGE.md` match
review-triage's: the diff-triggered checklist, rules read from the merge base, the REVIEW.md listing and the `RULES`
flag. Step 5 passes the triggered entries and the REVIEW.md commands to the reviewer, or grades them yourself at a
tight budget.

**Q30 (2026-11-24).** From mattpocock/skills `pr` at abeeaf9, ideas only (0 of 116 new word 6-grams shared). Step 6
says what a pull request body holds: the evidence as a before and an after, the triage table, and whether merging is a
two-way door (a revert undoes it) or a one-way door (data deleted or migrated, a published interface, a release, a
message to users). The owner report gains a `Door:` field. Upstream asks for the blast radius on every pull request;
this version asks for it, with what the owner should check first, only for a one-way door. Not taken: upstream's
Summary menu of visuals, which its CREDITS file says is copied from another project whose license was not checked.
