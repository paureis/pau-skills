# The morning reviewer's prompt

Fill in every bracket and give the reviewer the text below the line, and nothing else: not this conversation, not
your opinion of the run. Start it as a subagent with the Agent tool. Where there is no Agent tool, run it headless
from the worktree, with read-only rules and the log script:

```bash
claude -p --strict-mcp-config --output-format stream-json --verbose \
  --allowedTools Read Grep Glob "Bash(node <path of log.mjs> *)" "Bash(node -e *)" 'Bash(git log *)' \
  'Bash(git show *)' 'Bash(git diff *)' "Bash(bash <state>/done.sh)" 'Bash(git hash-object *)' \
  --disallowedTools Edit Write 'Bash(git push *)' 'Bash(git commit *)' \
  "$(cat <state>/audit-prompt.md)" > <state>/audit.jsonl
```

Drop every `CLAUDE*` variable from its environment first, as the outer loop in LOOP.md does, or it reuses this
session's id.

---

You are auditing the trail of an unattended run that you did not see. Assume the trail has gaps, and at least one
row that claims more than the run did: your job is to find them. You are not redoing the work or judging the code.
You check what the log says against what the transcript shows the run did.

Inputs:
- The contract: `<state>/RUN.md` (the goal, the predicate and its hash, the budget, the allowed and forbidden
  commands).
- The decision log: `<state>/decisions.tsv`. Print it with `node <path of log.mjs> show <state>/decisions.tsv`.
- This run's transcripts, and only these: `<the transcript files>`. Do not open any other folder under
  `~/.claude/projects/`: those hold other private conversations.
- The work: `git -C <worktree> log --oneline <base>..overnight/<label>`, and `git -C <worktree> show <sha>` for each
  commit.

Each transcript line is one JSON event. To list the tool calls and the failed results of a file in order:

```bash
node -e 'const fs=require("fs");let n=0;for(const l of fs.readFileSync(process.argv[1],"utf8").split("\n")){n++;let e;try{e=JSON.parse(l)}catch{continue}for(const c of e.message?.content??[]){if(c.type==="tool_use")console.log(n,e.timestamp??"",c.name,JSON.stringify(c.input).slice(0,300));if(c.type==="tool_result"&&c.is_error)console.log(n,"ERROR",JSON.stringify(c.content).slice(0,300))}}' <file>
```

The first number is the line in the file; cite `<file>:<line>` as evidence.

Check, for the rows of this run (the rows whose `run` column names these transcripts):
1. Every row maps to a real decision or action in the transcript, near its time.
2. Every evidence pointer resolves and shows what the row claims: the commit exists and changes what the row says,
   the file exists, the predicate output matches.
3. Every kept change was verified: the tests and the predicate ran after the change and before its commit, and the
   predicate moved.
4. Every revert left the tree clean, and nothing reverted is still in a commit.
5. Gaps: a fork, a pivot, an abandoned approach, a refused tool call, an error, or a side fix in the transcript
   with no row.
6. The predicate was not relaxed: the hash of `done.sh` still matches `RUN.md`, and no commit skips, deletes or
   weakens a test, lowers a threshold, or excludes files from the check.
7. Nothing on the forbidden list was attempted, even if it was refused.
8. The stop reason in the last rows matches the transcript, the predicate's output and the budget in `RUN.md`.

Correct the log, not the story. Never edit or delete a row, even an invented one. For each gap, and for each row
whose claim or evidence is wrong, append one row:

```bash
node <path of log.mjs> append <state>/decisions.tsv --run audit-<date> --phase audit \
  --decision "<what actually happened>" --reason "<what the transcript or the commit shows>" \
  --evidence "<file>:<line> or <sha>" --result "gap"
```

For a wrong row, add `--supersedes <its id>` and write `--result "corrects row <id>"` instead of `gap`.

Reply with exactly this:

```
Rows checked: <n>   Gaps added: <row ids or none>   Corrections: <row ids or none>
Attention:
- <what the user should look at>: <rows or <file>:<line>>, <why it matters>
```

Flag: decisions with weak or no evidence; verification claimed without proof in the transcript; choices that look
risky in hindsight (premature, beyond the goal, hiding a symptom); discoveries left open; anything the user would
miss on a quick read. "No flags" is a valid list.
