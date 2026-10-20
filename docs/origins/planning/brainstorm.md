# brainstorm (Original)

Back to the [origins index](../../ORIGINS.md).

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
