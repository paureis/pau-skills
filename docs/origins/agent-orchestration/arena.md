# arena and `arena.mjs` (Adapted from [pstack `arena`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/arena))

Back to the [origins index](../../ORIGINS.md).

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
