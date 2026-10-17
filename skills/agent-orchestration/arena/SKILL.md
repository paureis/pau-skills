---
name: arena
description: "Run several subagents at one task with different briefs, have a blind judge score them, then pick a base and graft in the best parts. Use when the user says 'arena this', 'try it several ways and pick', 'design it twice', or when a first attempt at an interface, data model or algorithm could lock in the wrong shape."
argument-hint: "[the task] [--n <candidates, default 3>]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/arena
---

# Arena

The task: $ARGUMENTS

Several candidates attempt the same task without seeing each other, each pushed in a different direction by its
brief. A fresh judge that sees only the rubric and the anonymous candidates scores them. You read every candidate,
score them yourself, pick a base and fold the best parts of the others into it by hand.

Use it when the first shape you think of is unlikely to be the best one and a wrong shape is expensive to undo: an
interface, a module layout, a data model, a tricky algorithm, a prompt. Do not use it for a change with one obvious
answer, a mechanical edit, or a bug fix where the evidence decides.

Bundled files, open them when you reach their phase:
- `${CLAUDE_SKILL_DIR}/CANDIDATE-BRIEF.md`: the prompt every candidate receives
- `${CLAUDE_SKILL_DIR}/JUDGE-BRIEF.md`: the prompt the judge receives
- `${CLAUDE_SKILL_DIR}/arena.mjs`: `init` makes the candidate folders, the rubric and the synthesis note; `blind`
  copies the candidates under shuffled letters for the judge (Node 20+, no dependencies)

Make a task list with one entry per phase (Frame, Fan out, Score, Judge, Pick, Graft, Verify) before launching
anything.

If you started this skill on your own, without the user typing its name or asking for it, first say in one or two
lines what it will do and what it will cost, and wait for a yes. If the user asked for it, go ahead.

## Cost first

The number of candidates N is 3 unless the user gave `--n`. Find the usage budget: the `LEAN_SUBAGENT_BUDGET`
environment variable (`echo "$LEAN_SUBAGENT_BUDGET"`), else `delegation.budget` in `.claude/review-rules.json`, else
`normal`. When it is `tight`, whoever started the skill, say the cost before starting and suggest 2: "An arena runs N candidate subagents and one
judge, so it costs roughly N + 1 times one attempt, plus my reading of every candidate. With a tight budget I suggest
2 candidates." Wait for the answer.

## Phase 1: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. **The artifact.** State what each candidate produces, concretely: which files, what format, where.
2. **The grounding.** List the files every candidate must read and the facts that hold whatever the design: callers
   that cannot break, types to interoperate with, limits, the commands that build and test the project. Read them
   yourself first; a frame written from file names is a guess.
3. **The rubric.** 3 to 6 criteria that a reader can check against the artifact itself, specific to this task. Not
   "clean" or "well designed": "the common call is one line", "no storage type appears in the interface", "adding a
   new kind needs one edit". The candidates never see the rubric: a candidate that sees it writes to the rubric, and
   every candidate converges on the same answer.
4. **One direction per candidate.** Diversity comes from the briefs. Give each candidate one constraint that pushes
   it toward a structurally different result, and follow it fully:

   | Task | Directions |
   |---|---|
   | an interface or module | minimize the interface (one to three entry points); maximize flexibility; optimize for the most common caller; design around the dependencies that cross the seam (ports and adapters) |
   | an implementation | the simplest thing that passes; reuse what the codebase has and add nothing new; a pure core with a thin shell around it; optimize the hot path |
   | a data model | one owner per fact, everything else derived; shaped for the main read; an append-only log of events |
   | a document or prompt | the shortest version that still works; led by examples; written for a reader who knows nothing |

   The interface directions are the ones in `improve-codebase-architecture` (its `INTERFACE-DESIGN.md`), if it is
   installed. Two directions that would lead to the same shape waste a seat; replace one.

   A different model or effort level per candidate adds a little more diversity. The Agent tool's `model` and
   `effort` fields are meant to be set only on an explicit request, so set them only when the user asked (for
   example "/arena ... one on a smaller model", "one at max effort"), and name only a model the session offers.
5. **The folders.** The arena folder holds the rubric and every brief, so no candidate may ever work in it or next
   to it. Put it in a temporary folder outside the repository, and never tell a candidate its path:
   ```bash
   node "${CLAUDE_SKILL_DIR}/arena.mjs" init <arena-dir> --n <N> --task "<one line>"
   ```
   Write the rubric into `<arena-dir>/rubric.md`. For a candidate that only writes new files, make its own work
   folder somewhere else (`mktemp -d`, one per candidate); a candidate that changes the repository gets a worktree
   in Phase 2.
6. **The base commit**, for a task that changes the repository. Commit your own work first: a worktree starts from
   a commit and does not carry uncommitted changes. Write `git rev-parse HEAD` on the `Base commit:` line of
   `<arena-dir>/SYNTHESIS.md`. Every candidate starts from it and every patch is taken against it.
7. **The briefs.** Fill `CANDIDATE-BRIEF.md` once per candidate. Only the "Your direction" field and the work folder
   differ. Save the exact prompt each candidate gets in its `candidate-<k>/brief.md`.

**Done when** the rubric has 3 to 6 checkable criteria, the base commit is recorded (for a repository change), every
brief field is filled, and the briefs differ only in their direction and work folder.

## Phase 2: Fan out

Launch all N candidates in one message so they run at the same time, each with the Agent tool and its own brief.
Never use `subagent_type: "fork"` for a candidate: a fork inherits this conversation, and with it the rubric and the
other briefs.

Where each candidate works:
- **It changes the repository** (code, or a sketch inside the real codebase): set `isolation: "worktree"`. Each gets
  its own temporary worktree and commits there; the result names the worktree path and branch. When it returns,
  check that its branch starts from the base commit (`git merge-base --is-ancestor <base-commit> <branch>`), then
  save the change as `candidate-<k>/change.patch` (`git diff <base-commit> <branch>`) and its final message as
  `candidate-<k>/notes.md`.
- **It only writes new files** (a design document, a standalone sketch): it writes in its own work folder from
  Frame. When it returns, copy that folder's contents into `candidate-<k>/` (`cp -R <work-folder>/. <arena-dir>/candidate-<k>/`)
  and save its final message as `candidate-<k>/notes.md`.

If the artifact can be run (tests in the patch, a sketch that type-checks), run the same check on every candidate
yourself, in its worktree or work folder, and save the output as `candidate-<k>/checks.txt`. The judge only reads, so
this is how evidence from a run reaches it.

Do not steer a candidate while it runs and do not pass one candidate another's work. A candidate that fails, stops
or returns nothing is a dropout: continue with N-1 and note it. With fewer than two candidates left there is no
arena: say so, then re-run or do the task once.

**Done when** every candidate has returned or been declared a dropout, and each `candidate-<k>/` holds its output.

## Phase 3: Score

Read every candidate end to end: the whole patch or document, not the notes. Score each criterion yourself and write
your scores and your choice of base in `SYNTHESIS.md` **before** the judge is launched. A judge's verdict arrives in
this conversation as soon as it finishes, so a judge started before your scores are written can anchor them.

## Phase 4: Judge

Start the judge only after every candidate has finished and your scores are written.

```bash
node "${CLAUDE_SKILL_DIR}/arena.mjs" blind <arena-dir>
```

It refuses a rubric without 3 to 6 numbered criteria or with a template placeholder left. It copies every candidate
with output, hidden files included and anything named `brief.md` or `.git` left out, and the rubric into a new
temporary folder under the letters A, B, C in shuffled order. It writes the key to `<arena-dir>/blind-key.json`
without printing it. A candidate with no non-empty file is a dropout. A link that could lead the judge to a brief or
outside the candidate makes it refuse, naming the link; fix the candidate folder and run it again. When a key
already exists it refuses, because a judge may still be reading the first blind folder; pass `--force` only when no
judge is running. Before launching the judge:
- Look through the blind folder for anything that names a candidate's direction or number (an absolute path such as
  `.../candidate-2/` in the notes or in `checks.txt`, a branch name, a commit message in the patch) and replace it
  with `[removed]` in the blind copy only.
- If a criterion compares the candidates with existing code ("no caller is longer than today"), copy that code into
  the blind folder as `reference/`. Without it the judge can only take the candidates' word for it. Better still,
  write criteria that the artifact alone can settle.

Launch one fresh subagent, not a fork, with `JUDGE-BRIEF.md` and the blind folder's path, and nothing else: not the
briefs, not the key, not your scores, not your own view. It only reads: tell it to change no file and run nothing.

## Phase 5: Pick

1. Read the verdict, open `blind-key.json`, and compare with your scores by candidate.
   - Agreement on the base confirms the pick.
   - Disagreement means one of you is biased or a criterion was unclear. You know which brief made which candidate
     and may favour the one you would have written; the judge may have read a criterion differently (it says so
     under "Ambiguous criteria"). Read the judge's evidence and the candidates' notes again before deciding, and
     record the reason in the note.
2. Pick the base a future maintainer can extend most easily without breaking its invariants. When two are tied,
   take the smaller interface or the clearer seam.

## Phase 6: Graft

Walk each other candidate once more for what is worth porting: usually one or two things each, not most of it.
Fold each graft in by hand so the result stays one design under one way of thinking: rename it to the base's terms,
reshape it to the base's types, drop what the base already covers. Never paste a block across, and never merge a
losing candidate's branch.

- **They converged** on one shape: that is strong agreement. Note it and ship the shared shape; no graft is needed.
- **They diverged wildly** (no two agree on the basic shape, and the scores are spread): the frame was
  under-specified. Tighten the task or add the missing fact or constraint, and re-run. Do not average the
  candidates.

For a code task, build the result on a new branch that starts from the base candidate's branch (or with its patch
applied), then make the grafts as separate commits. For a task that only produced files, copy the base candidate's
files to where the task said they go (or next to `SYNTHESIS.md`) and make the grafts there.

## Phase 7: Verify

Verify the result like any other work: the project's own tests, type check, lint and build; for a design, check that
the usage examples compile against the types. If `evaluator` is installed, run it on the result with the rubric as
the contract; otherwise give a fresh subagent the rubric and the result and ask it to find where the result fails.

If verification finds a problem the arena missed, decide which kind it is. The frame was wrong: re-frame and re-run.
A candidate had it and you missed the graft: go back to Phase 6. Do not patch over it.

Fill in `SYNTHESIS.md`: the base and why, the judge's verdict, your scores and the comparison, each graft with its
source, what was rejected and why, convergence and dropouts, and the verification result.

Clean up: list the candidate worktrees and branches (`git worktree list`) and remove them only with the user's yes
(`git worktree remove <path>`, then `git branch -D <branch>`; `-D` because a candidate branch is never merged). Delete
the blind folder.

## Do not

- Do not show the rubric to a candidate, or one candidate's work to another, and never let a candidate work in
  the arena folder.
- Do not give the judge the briefs, the key, this conversation or your opinion.
- Do not launch the judge before your own scores are written.
- Do not pick from the notes without reading the artifacts.
- Do not average divergent candidates or paste grafts across.

## Report

```
Arena: <task>   Candidates: <N> (<dropouts>)   Budget: <tight | normal | generous>
Directions: candidate-1 <direction>, candidate-2 <direction>, ...
Judge: base <candidate> (<letter>), totals <...>   Me: base <candidate>, totals <...>   Agree: yes | no, because <...>
Base: <candidate>, because <...>
Grafts: <what, from which candidate>   Rejected: <what, why>
Convergence: <converged | diverged, re-framed | mixed>
Verification: <command: PASS | FAIL>
Synthesis note: <path>   Left to clean up: <worktrees, branches, or none>
```
