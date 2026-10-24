# Things that bit the tenth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the tenth batch (Q12, what Q11 left):
- The orchestrator ran `cd` into a builder's worktree to run a test, and the session's working folder moved there,
  as batch 7 warned. Run a test in a worktree as `node --test <worktree>/tests/<file>` from the main checkout.
- Base controls cost little (about 3 US dollars for six runs) and are worth starting while the plan checks run: they
  showed that a headless maintain pass wrote its own helper script to `/tmp`, which the brief had not covered.
- A skill that confirms its prompt first (agent-friendly-audit's step 1) stops there in a one-turn headless run
  unless the prompt says to go ahead. Use the same go-ahead prompt on both sides of a control.
- A wording test that flattens whitespace passes while a sed mutation on a wrapped copy of the anchor survives. Keep
  each anchor whole on one line, once per line, and compare the per-line count with the flattened count.
- A test regex is case-sensitive; a brief that writes the anchor as a sentence start ("Never move") fails it. The plan
  check caught it.
- "Remove the scratch folder before the run on the current code" deleted the check's own files. A proof on the
  current code runs in a copy inside the folder, and a copy must be its own repository, since git run from the
  project root lists nothing in an ignored folder.
- The project-setup eval at 40 turns cost 35.77 US dollars and still did not end: the persona went on with its first
  task. Raising a limit does not fix a run that never ends.
- In a headless acceptEdits run, `mkdir` outside the project, commands with shell variables, multi-line quoted
  commands, `cd` before `git`, and `bash` or `sh` without an allow rule are all refused, each with its own message.
