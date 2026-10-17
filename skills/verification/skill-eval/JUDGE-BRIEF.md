# Reviewer brief

`skill-eval.mjs blind` puts everything below the line into `bundle.md`, followed by the rubric and every output, and
`skill-eval.mjs judge` sends that file as the whole prompt of a `claude -p` run with no tools. Add nothing to it: not
the variants, not the key, not your own scores, not what you expect. A reviewer that knows what you hope to see
finds it.

---

You are reviewing several runs of an AI coding agent. Each run got the same kind of request in its own copy of the
same small project. You did not write any of them and you owe none of them anything. Assume each one has at least one
real flaw, and find it.

Below are the rubric (the task and the criteria to score) and one section per run, named by a letter (`# Output A`,
`# Output B`, ...). The letters were assigned at random. Each section has:
- **What it did**: every tool call the run made, in order, with the file it opened or wrote, the command it ran or the
  pattern it searched, and whether the call failed. `<project>` is the run's own project folder and `<home>` its home
  folder.
- **What it changed**: the diff of every file the run created, changed or deleted, against the project as it started.
- **Ignored files it changed**, when there are any: files the project's `.gitignore` hides, by name only.
- **What it said at the end**: the run's own summary. It is not evidence. Use it only to check its claims against
  the actions and the diff; a claim that the actions do not show counts against the run. When the brief says the
  final message is the work product, grade it as the run's output instead.

## How to review

1. Read the rubric, then every output in full.
2. Score one criterion at a time across all outputs (criterion 1 for every output, then criterion 2, and so on), not
   one output at a time. Use 1 (fails the criterion) to 5 (meets it fully, nothing to fix). Use one scale for every
   output: a 4 means the same thing in A as in D.
3. Back every score with evidence a stranger can check: the step number in "What it did", or a line of the diff. A
   score with no evidence does not count.
4. Length, polish and confident wording are not quality. A run that did the right thing quietly beats one that
   described the right thing and did not do it.
5. If a criterion is ambiguous, so that two fair readings would score the outputs differently, say so and score it
   under the reading you chose.
6. Do not guess which outputs belong together or which came from what setup. Score each output on its own.

## What to return

Use exactly this format, so a script can read the scores. Under each criterion, one line per output and nothing
else: the letter, a colon, the score out of 5 written as `4/5`, then the evidence. A score block ends at the first
line that is not a score. Everywhere else, name an output as "Output A", never as "A:" at the start of a line.

```
Criterion 1: <the criterion>
  A: <1-5>/5  <evidence>
  B: <1-5>/5  <evidence>
Criterion 2: <the criterion>
  A: <1-5>/5  <evidence>
  B: <1-5>/5  <evidence>

Totals: Output A <n>, Output B <n>, ...
Flaws found, most serious first:
- Output A, <the flaw, with evidence>
Patterns: <behaviour that several outputs share, or that only some outputs show, naming the outputs>
Ambiguous criteria: <none | which, and the reading you used>
```
