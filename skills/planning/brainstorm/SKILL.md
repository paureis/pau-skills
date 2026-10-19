---
name: brainstorm
description: "Widen the options for an engineering or product decision in a codebase before settling it: options from named lenses, the agent recommends picks, code settles the facts, 3 or 4 rated. Use when the user says 'brainstorm this', 'give me alternatives' or 'widen this before we decide', or when a costly decision has only one idea on the table."
argument-hint: "[the question or goal] [with subagents]"
---

# Brainstorm

The question: $ARGUMENTS

If no question was given, ask for it first. That request does not count against the three questions in Frame.

Widen the options before anything is settled, then narrow them on purpose. Interviewing a plan narrows it, so
running an interview first locks in the first idea before any alternative exists. Brainstorm first, grill second.

Use it when the user has a goal and at most one idea for reaching it, and a wrong choice would cost real work: how a
feature should work, where a responsibility should live, how to solve a recurring problem in the project. Do not use
it for a change with one obvious answer, for a bug (the evidence decides), or for a choice between two options that
are already well defined (go straight to the interview).

Make a task list with one entry per phase (Frame, Diverge, Pick, Converge, Decide) before starting. If the session
has no task tool, post the five phases as a short checklist in the conversation and tick each one off as you go.

## How to ask

Keep the user's work to a tap or a word. Every question in this skill offers answers to choose from.

- **With a question tool** (AskUserQuestion in Claude Code), ask through it: up to 4 questions in one call, 2 to 4
  answers each, a header of at most 12 characters. Count the characters of every header: "Great outcome" is 13,
  "Outcome" fits. The tool adds an "Other" choice for a typed answer, so do not add
  one. When you recommend an answer, put it first and end its label with "(Recommended)".
- **Without one** (a headless run, a background subagent, another client), write the same questions as text:
  numbered questions, lettered answers, the recommended answer first and marked "(Recommended)". End with one line
  that says how to reply, for example "Reply ok to take the recommended answers, or type yours." Pick is the
  exception: there the option list is the question (see Pick).

**Blind.** If the user says "blind", in the question or at any point before Pick, show no picks and no reasons in
Pick, and recommend nothing until the finalists are rated. Without "blind", show your picks: holding them back only
makes the user ask for them.

## Phase 1: Frame (light, not a grill)

1. **Look before asking.** Read just enough of the project to know what already exists around the question: the
   files, scripts, docs or configuration it touches. A quick read, not a study. Do not ask what the code can tell.
2. **Ask at most three questions, all at once**, and only ones whose answer changes which ideas are worth having.
   The usual three: the goal behind the ask (what the user needs once this works), which constraints are hard, and
   what a great outcome would look like (headers "Goal", "Hard limits" and "Outcome"). Give each 2 to 4 proposed
   answers drawn from what you read, and mark none as recommended: the frame is the user's. Skip any the user has
   already answered; with none left, go to step 3. Send the questions alone and wait for the answers: the frame
   comes after them, never as a draft beside the questions.
3. **Sort the constraints.** A hard constraint is one the user confirmed, or that the code, a contract or the
   platform enforces. Everything else is assumed: inherited from the first idea, from habit, or from a guess.
   A check in the code that is itself what the question is about is assumed, not hard: when the question is how to
   keep copied files in sync, the test that forces the copies to be identical is one possible answer, not a limit.
   Assumed constraints are open to loosening in Diverge. Treat removing one as readily as adding one: a constraint
   that does not serve the goal goes, and one that would serve it is worth adding even if nobody asked for it.
4. **Park the user's own idea.** If they came with one, write it down as a candidate. It goes into Diverge like any
   other option and is never the default.
5. **Once the answers are in, show the frame in five short lines**, built from them, with the goal restated in
   your own words (a restatement that surprises the user is the most useful thing this phase can produce). In the
   same message, ask one question: is it right? Offer "Looks right" and "Change it", and wait for the answer before
   Diverge.

```
Goal: <one sentence, in your words>
Hard: <each hard constraint, and what enforces it>
Assumed: <each assumed constraint; open to loosening>
Outcome: <the great outcome the user described, concretely>
Your idea: <one line, or "none">
```

**Done when** the user has accepted the frame, or has corrected it and you have rewritten it.

## Phase 2: Diverge (no judging)

The lenses are for you, not for the user: work through them to find options nobody had in mind, then show only the
options. Every lens gives at least one option.

| Lens | How to use it |
|---|---|
| Baseline | The obvious answer most people would give first. |
| Invert | List what would guarantee failure, then flip the strongest item into an option. |
| Remove the biggest constraint | Take the assumed constraint that limits the options most and drop it. What becomes possible? If every constraint is hard, drop the biggest hard one anyway and say so: it shows what that constraint costs. |
| 10x bigger | The version for ten times the scale, users or ambition. |
| 10x cheaper | The version at a tenth of the effort or cost. Often the one that ships. |
| Borrow | How another field or another kind of system solves the same shape of problem (a library, a factory, a game, an operating system, a different language ecosystem). |
| Combine | Join two options from the other lenses into one. Do this lens last. |
| Do nothing or delete it | Leave it as it is, or remove the thing that causes the problem. Say what happens then. |
| Wild | One option that breaks an assumption nobody stated. It does not need to be practical. |

Rules for this phase:
- Show 8 to 12 options, grouped by the approach underneath them into 3 or 4 clusters of 2 to 4 options each. Give
  each cluster a name of at most 12 characters, counted (it becomes a question header): "Built-in sync" is 13, too
  long; "Built-in" fits. Number the options across all
  clusters.
- Each option is one line: a short name and what it is, concretely. "Use a manifest" is not an option; "hash each
  skill folder into a manifest at pack time and compare it with the installed copy" is. No lens tags.
- No ratings, no "but", no pros and cons, and do not drop an option for being impractical. Judging now kills the
  options that would have led somewhere.
- Two options that differ only in a detail count as one. When you have more than 12, merge or cut the closest
  duplicates, never the only option a lens gave.
- If the user came with an idea, it is one of the options, marked "(your idea)". It counts like any other.
- Keep a note of which lens gave each option, for yourself. It is not shown.

**With subagents (optional).** One model's ideas tend to cluster. Separate briefs spread them out. When the user asked
for subagents ("with subagents", "go wide") or the question is large, say the cost first (one subagent run per lens
except Combine, so eight) and wait for a yes. Then launch read-only subagents in one message, one lens each, every
lens except Combine, which you do yourself from their results. Use a read-only agent type such as Explore if the
session has one; otherwise tell each subagent not to edit anything. Do not give them the user's idea or each other's
options: an example anchors them. The brief:

```
You are generating options for one lens of a brainstorm. Do not edit, create or delete any file.
Goal: <from the frame>
Hard constraints: <from the frame>
Assumed constraints: <from the frame>
A great outcome: <from the frame>
Your lens: <its name and its line from the table>
You may read: <the files or folders that bear on the question>
Return 1 or 2 options. For each: a short name, then one sentence saying concretely what it is.
No ratings, no pros and cons, no preamble.
```

Merge their options, add the user's idea if they came with one, remove duplicates, do Combine, then cluster and trim
to 8 to 12 as above.

**Done when** 8 to 12 distinct options are shown in 3 or 4 clusters, every lens gave at least one, and none has been
judged.

## Phase 3: Pick (one round)

Show the whole list first. Then, in the same message, ask one multiple-choice question per cluster (several answers
allowed, the cluster name as its header, its options as the answers). Four clusters of up to four options fit in one
call of the question tool.

Your picks are the options you would take forward: 3 to 5 in all, from at least two clusters, and at least one that
is neither the Baseline nor Do nothing. Put each pick first in its cluster's question, with "(Recommended)" at the end
of its label and a one-line reason (in the answer's description, or after it in text). Without a question tool, list
the options once, under their clusters, with your picks marked "(Recommended)" and a reason each; do not repeat
them as lettered questions. End with: "Reply ok to take my picks, or type your own, for
example: keep 3, 7; drop 1; combine 2 and 9." With "blind", mark no picks and give no reasons.

Every option now has one status, and the summary uses the same words:
- `kept`: the user picked it, or it was made from a combine the user asked for. It goes to Converge.
- `dropped`: not picked, or ruled out later by a fact (then add the fact: "dropped: <fact>").
- `chosen`: the direction the user picks at the end.

If the user drops everything, the frame was wrong. Ask what all the options got wrong, rewrite the frame, and diverge
again once.

**Done when** the user has answered the pick question (an "ok" counts).

## Phase 4: Converge

1. **Shortlist 3 or 4 finalists** from the kept options. Do not run a second round of marks. Fold what would make a
   finalist stronger into it instead: remove its biggest cost, fix the weakness the Invert lens would find in it,
   merge two kept options that fit together, or carry out a combine the user asked for. Say in one line what you
   folded into each finalist, and in one line why each kept option that is not a finalist is out.
   - Fewer than three kept: add the Baseline so there is always something to beat, or Do nothing when the Baseline
     is already a finalist. More than four: merge the closest, or drop the weakest with its reason.
   - No finalist reaches the great outcome from the frame: say so plainly and offer to bring back the dropped option
     that came closest, in place of the weakest finalist, so there are never more than four. The user decides.
2. **Settle questions of fact, do not debate them.** A question of fact is one the world can answer: does the tool
   expose this, how slow is it, does this file already exist, what do callers do today. Settle each one that would
   change how a finalist rates or which one wins:
   - by reading the code. If `codebase-oracle` is installed (it may appear under a prefix, such as
     `<plugin>:codebase-oracle`), use it; if it is not, read the code yourself, starting from the entry point a
     caller hits;
   - or by a quick throwaway prototype: the smallest script or experiment that shows the behaviour, in a temporary
     folder outside the repository. Observe the result, do not polish it, and delete it afterwards. Build two
     variants side by side when the question is which of two behaves better.

   A finalist a fact rules out becomes `dropped: <the fact>`; replace it from the kept options if fewer than three
   are left. A fact you cannot settle now goes to "Open questions". A question of taste or priority is the user's,
   not a prototype's.
3. **Weigh each finalist**, with the facts in hand, on value, effort, risk and reversibility, unless the user picked
   other criteria. Rate each low, medium or high, with a short reason. For value and reversibility, high is good;
   for effort and risk, low is good. Never add the ratings into a score: they are not on one scale, and a total
   hides the tradeoff the user has to make.

   | Option | Value | Effort | Risk | Reversibility |
   |---|---|---|---|---|
   | <name> | high: <why> | low: <why> | medium: <why> | high: <why> |

4. **Premortem each finalist in one line.** "It is six months from now and this failed. Why?" The most likely cause,
   and the first sign that would show it early.
5. **Ask for the choice** in one question: the 3 or 4 finalists as its answers, your recommendation first with
   "(Recommended)" and its reason in a sentence. The choice is the user's.

**Done when** the user has chosen a direction, or has said none of the finalists is good enough (then go back to
Pick with what they said, once).

## Phase 5: Decide and hand off

Write the summary in the conversation. Save it to a file only if the user asks, where the project keeps design notes
if it has a place.

```
# Brainstorm: <the question>

Chosen: <the option, and why it won, with the facts that settled it>
Gives up: <what this direction costs or rules out>
Runner-up: <the option, and what would make it the better choice>
Options: <one line per cluster: each option with kept, dropped or chosen>
Open questions: <each, with who or what can answer it, or "none">
```

Then suggest the next step. If `grill-me` is installed, offer to run it on the chosen direction to settle the
decisions it still leaves open. If it is not installed, ask the user the two or three decisions the chosen direction
leaves open, one at a time, with a recommended answer for each.

After that, if `to-prd` is installed, offer to run it to write the spec from the conversation. If the direction is a
new interface, module layout or data model and `architect` is installed, offer to run it to sketch its shape before
building. If neither is installed, the summary is the input for whatever spec or plan the user writes next.

## Do not

- Do not grill in Frame: three questions at most, and only ones that change which ideas are worth having.
- Do not make the user's idea the default, or show it to subagents.
- Do not judge during Diverge, do not skip a lens because it feels silly, and do not show lens tags.
- Do not hold your picks back unless the user said "blind".
- Do not run a second round of marks: fold the improvements into the finalists.
- Do not add the ratings into a score.
- Do not settle a question of fact by argument when the code or a prototype can settle it.
- Do not start building. This skill ends at a decision and a summary.
