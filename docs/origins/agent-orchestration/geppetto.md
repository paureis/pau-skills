# geppetto, `check-agents.mjs` and the starter roster (Original)

Back to the [origins index](../../ORIGINS.md).

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
(Read, Grep, Glob and Agent only, so it cannot write code; it plans, then after a yes starts builders
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
review is never lost. After the batch the owner dropped SendMessage from `eng-lead` (decision 10), since the main
session sends the fix rounds, and the roster went to version 2.

**Batch 8 (2026-10-23).** Two additions. The designer comes from Peng Zheng's design bot in the same episode, which
takes a design system and one keyframe ("I will do the first 5%") and extends them into every screen of a flow (Q3).
Here it works on a design system in code, because the Figma connector failed in three sessions; it fills its design
system section with paths only and lists every value it had to invent. The production rules block (Q8) comes from
`launch-readiness`'s `PRODUCTION-RULES.md`; `builder` follows it and `reviewer` checks against it. The roster went
to version 3.

**Roster 5 (Q23, ponytail).** `builder` carries ponytail's smallest-complete-change ladder, the finish-the-change,
bug-fix-callers and never-cut lines and the `shortcut:` comment form (`skills/ponytail/SKILL.md` at
[96608e0](https://github.com/DietrichGebert/ponytail/tree/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846), MIT), held to the
brief's file list and test first. `reviewer` step 9 is `ponytail-review`'s lean check: a concrete case with
file:line and a search, contract items and the never-cut list never reported, a shortcut a decision, size after
correct, safe and tested, and no claim's verdict changed. `eng-lead` sends such a finding with its case to the fix
round and drops one without.

**Roster 6 (Q24, 2026-11-18).** From the Claude Code team's article on verification (claude.dev blog, 2026-11-16), ideas only, no shared text. The reviewer gets the checklist items the diff triggers, or the
`review-scope.mjs change` command that prints them, and grades each as a claim named `Checklist #<n>`: its check is
the claim, its why the past mistake behind it. Only an exit 0 with no Checklist line means none is configured; a failed
command leaves the checklist claims UNVERIFIED. It reads each listed REVIEW.md with `git show <base>:<path>`, nearest
folder first, and a REVIEW.md the change edits still applies at its base version. `eng-lead` has no Bash, so it puts
the command, filled with the slice's worktree and base commit, into each reviewer prompt.
