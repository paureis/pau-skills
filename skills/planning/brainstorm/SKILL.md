---
name: brainstorm
description: "Widen the options for an engineering or product decision in a project before anything is settled. Frame the goal with at most three questions, generate 10 to 20 options through named lenses (invert the problem, remove the biggest constraint, 10x bigger and 10x cheaper, borrow from another field, combine, delete it, one wild option), let the user keep, kill or combine them, converge on 3 to 5 rated on value, effort, risk and reversibility with a premortem each, settle questions of fact by reading the code or a quick prototype, and end with a one-page summary ready for grill-me. Use when the user types /brainstorm or says 'brainstorm this', 'what are our options', 'give me alternatives', 'widen this before we decide', 'I only have one idea'. Works inside a codebase on a decision about it; run it before grill-me, which narrows."
argument-hint: "[the question or goal] [with subagents]"
disable-model-invocation: true
---

# Brainstorm

The question: $ARGUMENTS

Widen the options before anything is settled, then narrow them on purpose. Interviewing a plan narrows it, so
running an interview first locks in the first idea before any alternative exists. Brainstorm first, grill second.

Use it when the user has a goal and at most one idea for reaching it, and a wrong choice would cost real work: how a
feature should work, where a responsibility should live, how to solve a recurring problem in the project. Do not use
it for a change with one obvious answer, for a bug (the evidence decides), or for a choice between two options that
are already well defined (go straight to the interview).

Make a task list with one entry per phase (Frame, Diverge, React, Converge, Decide) before starting.

## Phase 1: Frame (light, not a grill)

1. **Look before asking.** Read just enough of the project to know what already exists around the question: the
   files, scripts, docs or configuration it touches. A quick read, not a study. Do not ask what the code can tell.
2. **Restate the goal** in your own words, in one or two sentences, and show it with your first question. A
   restatement that surprises the user is the most useful thing this phase can produce.
3. **Ask at most three questions, one at a time**, and only ones whose answer changes which ideas are worth having.
   The usual three: the goal behind the ask (what the user needs once this works), which constraints are hard, and
   what a great outcome would look like. Skip any the user has already answered. Recommend nothing yet.
4. **Sort the constraints.** A hard constraint is one the user confirmed, or that the code, a contract or the
   platform enforces. Everything else is assumed: inherited from the first idea, from habit, or from a guess.
   Assumed constraints are open to loosening in Diverge. Treat removing one as readily as adding one: a constraint
   that does not serve the goal goes, and one that would serve it is worth adding even if nobody asked for it.
5. **Park the user's own idea.** If they came with one, write it down as a candidate. It goes into Diverge like any
   other option and is never the default.

Write the frame down and show it:

```
Goal: <one or two sentences, in your words>
Hard constraints: <each, and what enforces it>
Assumed constraints: <each; open to loosening>
A great outcome: <what the user said, concretely>
The user's idea: <one line, or "none">
```

**Done when** the user has seen the frame and not corrected it, or has corrected it and you have rewritten it.

## Phase 2: Diverge (no judging)

Generate 10 to 20 options, spread on purpose through these lenses. Every lens gives at least one option.

| Lens | How to use it |
|---|---|
| Baseline | The obvious answer most people would give first. The user's idea goes here if it is the obvious one. |
| Invert | List what would guarantee failure, then flip the strongest item into an option. |
| Remove the biggest constraint | Take the assumed constraint that limits the options most and drop it. What becomes possible? If every constraint is hard, drop the biggest hard one anyway and say so: it shows what that constraint costs. |
| 10x bigger | The version for ten times the scale, users or ambition. |
| 10x cheaper | The version at a tenth of the effort or cost. Often the one that ships. |
| Borrow | How another field or another kind of system solves the same shape of problem (a library, a factory, a game, an operating system, a different language ecosystem). |
| Combine | Join two options from the other lenses into one. Do this lens last. |
| Do nothing or delete it | Leave it as it is, or remove the thing that causes the problem. Say what happens then. |
| Wild | One option that breaks an assumption nobody stated. It does not need to be practical. |

Rules for this phase:
- Each option is a short name and one sentence that says concretely what it is. "Use a manifest" is not an option;
  "write a hash of each skill folder into a manifest at pack time and compare it with the installed copy" is.
- No ratings, no "but", no pros and cons, and do not drop an option for being impractical. Judging now kills the
  options that would have led somewhere.
- Two options that differ only in a detail count as one. Replace the duplicate.
- Tag each option with its lens, for example `[invert]`.

**With subagents (optional).** One model's ideas tend to cluster. Separate briefs spread them out. When the user
asked for subagents ("with subagents", "go wide") or the question is large, say the cost first (one subagent run per
lens, about seven) and wait for a yes. Then launch read-only subagents in one message, one lens each, every lens
except Combine, which you do yourself from their results. Use a read-only agent type such as Explore if the session
has one; otherwise tell each subagent not to edit anything. Do not give them the user's idea or each other's
options: an example anchors them. The brief:

```
You are generating options for one lens of a brainstorm. Do not edit, create or delete any file.
Goal: <from the frame>
Hard constraints: <from the frame>
A great outcome: <from the frame>
Your lens: <its name and its line from the table>
You may read: <the files or folders that bear on the question>
Return 2 to 4 options. For each: a short name, then one sentence saying concretely what it is.
No ratings, no pros and cons, no preamble.
```

Merge their options with yours, remove duplicates, then do Combine.

**Done when** there are 10 to 20 distinct options, every lens has at least one, and none has been judged.

## Phase 3: React

1. **Cluster** the options by the approach underneath them, not by lens: 3 to 6 clusters, each with a short name.
   Number every option across all clusters and show each on one line with its lens tag.
2. **Ask the user to mark them**: keep, kill or combine, for example "keep 3, 7; kill 1, 4; combine 2 and 9". An
   unmarked option is neither kept nor killed; it goes into the summary as "not taken up".
3. **Second round, smaller: build on the keepers.** Write 3 to 6 new options, one line each, without judging. Each
   one makes a keeper stronger (removes its biggest cost, fixes the weakness the Invert lens would find in it), merges
   two keepers, or carries out a "combine" mark.
4. **Show the round-one keepers again with the new options**, numbered as one list, and ask for one more round of
   marks. These marks are final: what the user keeps here is the pool for the shortlist. Then stop diverging.

If the user kills everything in round one, the frame was wrong. Ask what all the options got wrong, rewrite the
frame, and diverge again once.

**Done when** the user has marked both rounds.

## Phase 4: Converge

1. **Shortlist 3 to 5** from the options kept in the second round. If fewer than three survive, add the baseline or
   "do nothing" so there is always something to beat. Say in one line why each option outside the shortlist is out.
   Then check the shortlist against "A great outcome" from the frame. If no finalist reaches it, say so plainly and
   offer to bring back the killed or unmarked option that came closest; the user decides.
2. **Weigh each finalist** on value, effort, risk and reversibility, unless the user picked other criteria. Rate each
   low, medium or high, with a one-line reason. For value and reversibility, high is good; for effort and risk, low
   is good. Never add the ratings into a score: they are not on one scale, and a total hides the tradeoff the user
   has to make.

   | Option | Value | Effort | Risk | Reversibility |
   |---|---|---|---|---|
   | <name> | high: <why> | low: <why> | medium: <why> | high: <why> |

3. **Premortem each finalist.** "It is six months from now and this failed. Why?" Write the most likely cause in one
   or two lines, and the first sign that would show it early.
4. **Settle questions of fact, do not debate them.** A question of fact is one the world can answer: does the tool
   expose this, how slow is it, does this file already exist, what do callers do today. Settle each one that would
   change which finalist wins:
   - by reading the code. If `codebase-oracle` is installed, use it; if it is not, read the code yourself, starting
     from the entry point a caller hits;
   - or by a quick throwaway prototype: the smallest script or experiment that shows the behaviour, in a temporary
     folder outside the repository. Observe the result, do not polish it, and delete it afterwards. Build two
     variants side by side when the question is which of two behaves better.

   A fact you cannot settle now goes to "Open questions". A question of taste or priority is the user's, not a
   prototype's.
5. **Recommend one finalist**, with the reason in a sentence, and let the user choose. The choice is theirs.

**Done when** the user has chosen a direction, or has said none of the finalists is good enough (then go back to
Phase 3 with what they said, once).

## Phase 5: Decide and hand off

Write the one-page summary in the conversation. Save it to a file only if the user asks, where the project keeps
design notes if it has a place.

```
# Brainstorm: <the question>

## Problem
<the goal from the frame, the hard constraints, what a great outcome looks like>

## Options considered
<every option from both rounds, grouped by cluster, one line each, with what happened to it:
kept, killed by the user, merged into <name>, not shortlisted because <reason>, or not taken up>

## Shortlist
<the ratings table, then one premortem line per finalist>

## Facts settled
<each question of fact, how it was settled (code read, prototype), and the answer>

## Chosen direction
<the option, why it won, and what it gives up>

## Open questions
<what is still undecided or unknown, each with who or what can answer it>
```

Then suggest the next step. If `grill-me` is installed, suggest the user run `/grill-me` on the chosen direction to
settle the decisions it still leaves open. If it is not installed, ask the user the two or three decisions the chosen
direction leaves open, one at a time, with a recommended answer for each.

After that, if `to-prd` is installed, suggest the user run `/to-prd` to write the spec from the conversation. If the
direction is a new interface, module layout or data model and `architect` is installed, suggest the user run
`/architect` to sketch its shape before building. If neither is installed, the summary is the input for whatever spec
or plan the user writes next.

## Do not

- Do not grill in Frame: three questions at most, and only ones that change which ideas are worth having.
- Do not make the user's idea the default, or show it to subagents.
- Do not judge during Diverge, and do not skip a lens because it feels silly.
- Do not add the ratings into a score.
- Do not settle a question of fact by argument when the code or a prototype can settle it.
- Do not start building. This skill ends at a decision and a summary.
