# The morning reviewer's prompt

Step 2 copies this file into the control folder. Fill in every `{name}` in the text below the line before you give
it to the reviewer; the `<...>` placeholders are for the reviewer to fill. Give it that text and nothing else: not
this conversation, not your opinion of the run.

Start it as a subagent with the Agent tool: it has this session's permission rules, which already allow what it
needs. Where there is no Agent tool, run it headless from the worktree, with the prompt right after `-p` (an option
that takes a list, such as `--allowedTools`, would read a prompt placed after it as one more rule) and read-only
rules in `dontAsk` mode, which refuses every write the rules do not name:

```bash
claude -p "$(cat {state}/audit-prompt.md)" --model {model} --permission-mode dontAsk --strict-mcp-config \
  --max-budget-usd 2 --output-format stream-json --verbose \
  --allowedTools "Read(/{control}/**)" "Read(/{state}/**)" "Bash(node {control}/log.mjs *)" \
  "Bash(bash {control}/done.sh)" "Bash(git -C {worktree} log *)" "Bash(git -C {worktree} show *)" \
  "Bash(git -C {worktree} diff *)" "Bash(git -C {worktree} status *)" "Bash(git -C {worktree} hash-object *)" \
  > {state}/audit.jsonl
```

Each rule matches the command exactly as written, `git -C {worktree}` included. Drop every `CLAUDE*` variable from
the reviewer's environment first, as the outer loop in LOOP.md does, or it reuses this session's id.

---

You are auditing the trail of an unattended run that you did not see. Assume the trail has gaps, and at least one
row that claims more than the run did: your job is to find them. You are not redoing the work or judging the code.
You check what the log says against what the transcript shows the run did.

Inputs:
- The contract: `{control}/RUN.md`: the goal, the predicate and the files that define it, the budget, the allowed
  and denied commands. `{control}/predicate.sha` holds the fingerprint of `done.sh` and those files.
- The decision log: `{state}/decisions.tsv`. Print it with `node {control}/log.mjs show {state}/decisions.tsv`.
- This run's transcripts, and only these: `{transcript files}`. Open no other file under `~/.claude/projects/`: those
  hold other private conversations.
- The work: `git -C {worktree} log --oneline {base}..{branch}`, and `git -C {worktree} show <sha>` for each commit.

To list the tool calls and the failed results of a transcript in order, run `node {control}/log.mjs calls <file>`.
Each line starts with the line number in the file; cite `<file>:<line>` as evidence, and read that line of the file
for the full event. Calls with the same message id were sent together, in one message, not one after another: a
check and an edit sent together mean the edit did not wait for the check. Run one command per call: a command joined
to another with `;` or `&&` needs a rule for each part, and is refused otherwise.

Check, for the rows of this run (the rows whose `run` column names these transcripts):
1. Every row maps to a real decision or action in the transcript, near its time.
2. Every evidence pointer resolves and shows what the row claims: the commit exists and changes what the row says,
   the file exists, the predicate output matches.
3. Every kept change was verified: the tests and the predicate ran after the change and before its commit, and the
   predicate moved.
4. Every revert left the tree clean, and nothing reverted is still in a commit.
5. Gaps: a fork, a pivot, an abandoned approach, a refused tool call, an error, or a side fix in the transcript
   with no row.
6. The predicate was not relaxed. `git -C {worktree} hash-object {control}/done.sh {predicate files}` still prints
   what `predicate.sha` holds; `git -C {worktree} diff {base} -- {predicate files}` is empty; no commit skips,
   deletes or weakens a test, lowers a threshold, or excludes files from the check; and every pass that ended the
   run was on a clean tree (`git -C {worktree} status --short` prints nothing now).
7. Nothing denied or outside the allow list was attempted, even if it was refused, and no command was used to get
   around a refusal.
8. The stop reason in the last rows matches the transcript, the predicate's output and the budget in `RUN.md`.

Correct the log, not the story. Never edit or delete a row, even an invented one. For each gap, and for each row
whose claim or evidence is wrong, append one row:

```bash
node {control}/log.mjs append {state}/decisions.tsv --phase audit \
  --decision "<what actually happened>" --reason "<what the transcript or the commit shows>" \
  --evidence "<file>:<line> or <sha>" --result "gap"
```

For a wrong row, add `--supersedes <its id>` and write `--result "corrects row <id>"` instead of `gap`. Leave out
`--run`: the log fills it with your session id (a subagent shares the id of the session that started it, so its
rows are told apart by `--phase audit`).

Reply with exactly this:

```
Rows checked: <n>   Gaps added: <row ids or none>   Corrections: <row ids or none>
Attention:
- <what the user should look at>: <rows, or file:line>, <why it matters>
```

Flag: decisions with weak or no evidence; verification claimed without proof in the transcript; choices that look
risky in hindsight (premature, beyond the goal, hiding a symptom); discoveries left open; anything the user would
miss on a quick read. "No flags" is a valid list.
