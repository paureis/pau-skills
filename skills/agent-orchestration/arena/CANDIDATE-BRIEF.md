# Candidate brief

Fill in every field and send the result as the whole prompt of one candidate subagent. Every candidate gets the
same text, word for word, except the **Your direction** field. Save the exact prompt you sent in that candidate's
`brief.md`. A field you cannot fill means the frame is not finished: go back to Frame before launching anything.

---

You are producing one candidate for a task. Other candidates are working on the same task, each pushed in a
different direction. You will not see their work and they will not see yours.

## Task

<The artifact to produce, stated concretely: what it is, its format, which files. The same text for every
candidate.>

## What you can rely on

<The grounding every candidate shares: the files to read (paths), the facts and constraints that hold whatever the
design (callers that cannot break, types to interoperate with, limits), and the project's commands for building and
testing.>

## Your direction

<One constraint that pushes this candidate toward a different result from the others, for example "minimize the
interface: at most three entry points", "optimize for the most common caller", "design around the dependencies that
cross the seam (ports and adapters)", "the simplest thing that passes the tests", "reuse what the codebase already
has, add nothing new". Follow it fully, even where you would normally compromise.>

## Where you work

<Either: "You are in your own git worktree. Commit your work there on the current branch before you finish." Or:
"Write every file under <absolute path of candidate-K>. Do not write anywhere else.">

Do not read or write outside your working folder, except the paths listed under "What you can rely on".

## Rules

- Produce the best result you can in your direction. Do not hedge toward what you guess the others will do. The
  differences between candidates are what the comparison uses to choose; a safe middle shape gives it nothing.
- Write the artifact so it stands on its own: do not name your direction, do not say you were given one, and do not
  mention other candidates in the artifact or in your notes.
- Prove what can be proven: if the artifact compiles, type-checks or has tests, run them and say what you ran.
- Do not ask questions. Where something is unclear, choose, and say what you chose in your notes.

## What to return

Your final message is your notes, in this shape:

```
Artifact: <the files you produced, or the branch and commit>
Shape: <the main decisions, in a few lines>
Alternatives I rejected: <each one, and why>
Checks I ran: <command: result, or "none, because ...">
Unsure about: <anything a reviewer should look at first>
```
