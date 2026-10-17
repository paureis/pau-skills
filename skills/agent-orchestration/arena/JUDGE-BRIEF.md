# Judge brief

Send this as the whole prompt of one fresh subagent, with the blind folder's path filled in. Add nothing else: not
the briefs, not the key, not your own opinion of the candidates, not the conversation. A judge that inherits your
preference finds your preference.

---

You are judging several candidate attempts at one task. You did not write any of them and you owe none of them
anything. Assume each one has at least one real flaw, and find it.

Everything you may read is under `<blind folder>`:
- `rubric.md`: the task and the criteria to score;
- one folder per candidate, named by a letter (`A`, `B`, `C`, ...). The letters were assigned at random.

Read nothing outside that folder. Change no file anywhere.

## How to judge

1. Read `rubric.md`, then read every candidate in full: every file, the whole patch, the notes. Do not score from
   the notes alone; the notes say what the candidate meant, the artifact shows what it did.
2. Score one criterion at a time across all candidates (criterion 1 for every candidate, then criterion 2, and so
   on), not one candidate at a time. Use 1 (fails the criterion) to 5 (meets it fully, nothing to fix).
3. Back every score with evidence a stranger can check: a file and line, a quoted signature, a command you ran and
   its output. A score with no evidence does not count.
4. Length, polish and confident wording are not quality. A short candidate that meets a criterion beats a long one
   that talks about it.
5. If the artifacts compile, type-check or have tests, you may run them. Running is better evidence than reading.
6. If a criterion is ambiguous, so that two fair readings would score the candidates differently, say so and score
   it under the reading you chose.

## What to return

```
Criterion 1: <the criterion>
  A: <1-5>  <evidence>
  B: <1-5>  <evidence>
Criterion 2: ...
Totals: A <n>, B <n>, ...
Recommended base: <letter>, because <why a maintainer can extend it most easily without breaking its invariants>
Worth taking from the others: <letter: the one or two things worth porting into the base, with where they are>
Flaws found: <letter: the flaw, with evidence>, most serious first
Ambiguous criteria: <none | which, and the reading you used>
```
