---
name: overnight-run
description: "Run one task unattended under a contract: trust checks first, a finish condition a script checks, an append-only decision log, reverts, an off switch, and a morning audit by a fresh reviewer. Use when the user says 'run this overnight', 'keep going while I sleep', 'work on this while I am away'. /loop only wakes; for one number, hillclimb fits."
argument-hint: "[the task, what done means, the budget]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/docs/guide/07-overnight.md
---

# Overnight run

The task: $ARGUMENTS

Leave an agent working on one task while the user is away, and give them a result they can check in the morning.
The run starts only once it has earned trust. It works in its own worktree, stops on a finish condition a script
checks, logs every decision to an append-only log outside the repository, reverts what did not help, and stops and
writes up why when it is stuck. It ends with an audit of its trail by a fresh reviewer and a summary whose last
section, Attention, says what to look at first.

If you started this skill on your own, without the user typing its name or asking for what it does, first say in
one or two lines what it will do and what it will cost, and wait for a yes. A remark or a question that only
matches its description is not asking for it. If the user asked for it, or the brief you are working from does,
go ahead.

How it differs from its neighbours:
- The built-in `/loop` command and scheduled tasks are timers: they wake an agent. This skill is the contract and
  the audit around one run; step 4 picks the timer.
- To make one number better (run time, size, a score), use `hillclimb` if it is installed: it is this loop with
  measurement and noise rules. Without it, use this skill with the target number as the finish predicate.
- The stop rules come from `methodology` if it is installed; step 1 has a short fallback.

Bundled files, open each when you reach its step:
- `${CLAUDE_SKILL_DIR}/log.mjs` (Node 20+, no dependencies): `append` adds one row to the decision log, `show` prints
  it with what supersedes what. Below, `LOG` stands for `node "${CLAUDE_SKILL_DIR}/log.mjs"`; write the full
  command each time, since a shell variable does not survive from one Bash call to the next.
- `${CLAUDE_SKILL_DIR}/LOOP.md`: each way to wake a run and what it needs, the outer shell loop around `claude -p`,
  and where the log goes for a cloud scheduled task.
- `${CLAUDE_SKILL_DIR}/AUDIT.md`: the morning reviewer's prompt.

Make a task list with one entry per step (Trust, Contract, Worktree, Wake, Loop, Stop, Audit, Summary) before you
start.

## Step 1. Earn the trust, or do not start

A loop nobody trusts produces unchecked work faster. Check each item below and write a short table: the item, holds
or missing, and the evidence. Ask the user (AskUserQuestion) for what is missing while they are still here.

If any item is missing and nobody can fix it now (a headless run, or the user has left), **do not start the loop**.
Reply with the table, what each missing item needs, and an offer to run the task attended first. That reply is the
whole run.

1. **The task has run attended at least once.** The user watched an agent do this task, or one iteration of it, on
   this repository, in this session or one they point to, so both know what a good iteration looks like. "It should
   be easy" is not that. If not, run one iteration now with the user watching, then come back here.
2. **A finish predicate a script can check**: a command that exits 0 when the task is done and non-zero before,
   and prints on its last line how far there is to go (`remaining: 12`: failing tests, old callers, lint errors).
   For example `! grep -rn 'oldParse(' src/` followed by the test command, or the test command alone when failing
   tests are the task (`pytest -q`, `go test ./...`, `cargo test`, `mvn -q test`, `dotnet test`, `npm test`).
   - A duration is not a finish condition: "work on it for four hours" gives nothing to check, and the user wakes
     up to four hours of motion. A duration can be a budget (item 4).
   - "Better", "cleaner" or "faster" is not a predicate until it is a count or a check.
   - It fails now, for the reason the task names. If it passes already, there is nothing to run.
3. **The checks are fast and trusted.** The predicate and the test command each finish in minutes, and give the
   same answer twice on unchanged code: run both twice now. A flaky check turns every keep and revert into a coin
   toss; fix it first, attended.
4. **A stop, set now.** Use the stop rules of `methodology` if it is installed (every unattended run has a dead end
   and a budget, set before it starts). Without it: a dead end (3 different approaches with no progress on the
   predicate, or no untried idea left, whichever comes first) and a budget (iterations, default 20; money, as
   `--max-budget-usd` per headless turn; and a wall clock time, as a budget, never as the finish). Reaching either
   stops the run. The run never raises its own budget.
5. **Permissions settled in advance**, as concrete rules. List every command the run needs (the test command, the
   predicate, the build, `git add`, `git commit`, `git restore`, `git status`, `git diff`, `git log`, `LOG`) as
   allow rules (`--allowedTools 'Bash(pytest *)'` and so on), and the forbidden ones as deny rules
   (`--disallowedTools`). The deny list holds at least: `git push` and every force push; deploys and releases
   (`kubectl`, `terraform apply`, `npm publish`, `cargo publish`, `gh release`); deleting data (database drops,
   `rm -rf` outside the worktree); and messaging people (mail, chat, issue and pull request comments, `gh`). Never a
   blanket bypass: no `--dangerously-skip-permissions`, no `bypassPermissions` mode. In a session that stays open, a
   permission prompt waits until morning, so the same rules go into `.claude/settings.local.json`
   (`permissions.allow` and `permissions.deny`) before the user leaves.
6. **The work can be thrown away**: a fresh worktree on its own branch (step 3) and nothing pushed, so a bad night
   costs one branch.

The predicate is never relaxed during the run: not a threshold, not a skipped or deleted test, not an excluded
folder. A predicate that turns out wrong stops the run (step 6), and the user amends it.

## Step 2. Write the contract

Make a state folder outside the repository's work tree, where `git reset --hard` and `git clean -fdx` cannot reach
it and every wake can find it: from the repository root, print `echo "$(cd .. && pwd)/<repo>-overnight/<label>"`,
where the label is the date and a short slug (`2026-10-18-parser`). Use that absolute path as `<state>` below, and
absolute paths everywhere. (A cloud scheduled task sees only its clone: see the end of LOOP.md.)

It holds:
- `RUN.md`, the contract, from the template below. It also tells any wake what to do, so a run that resumes without
  this skill loaded still follows it.
- `done.sh`, the predicate as a script. It lives outside the work tree so the run cannot edit it into passing.
  Record `git hash-object <state>/done.sh` in `RUN.md`; every check compares the hash first, and a change stops the
  run.
- `decisions.tsv`, the log. `LOG append` creates it and its folder with the header on the first row, and refuses a
  path inside a git work tree.
- Later: `resume.md` (step 6), `summary.md` (step 8), and the loop's own files (LOOP.md).

```
# Overnight run: <goal>
Goal:        <one or two sentences, in the user's words>
Base:        <branch or commit>      Branch: overnight/<label>      Worktree: <absolute path>
Predicate:   bash <state>/done.sh    (git hash-object: <hash>)      At start: <its last line>
Tests:       <the test command>
Budget:      <n> iterations; $<x> per headless turn; no new iteration after <time>
Dead end:    <n> approaches with no progress, or no untried idea left
Allowed:     <the allow rules>
Forbidden:   <the deny rules>
Wake:        <the way from step 4>
Off switch:  touch <state>/STOP
Log:         <state>/decisions.tsv      Run ids: <session ids or labels, as they start>

Each wake: if <state>/STOP exists, pause (resume.md, a stop row, end). Read this file and the last ten log rows
(node <path of log.mjs> show <state>/decisions.tsv --last 10). Check the hash, then run the predicate: exit 0 means
finished. Otherwise make one small change, run the tests and the predicate, commit it if the predicate moved and
the tests pass, revert it if not, and log one row. Never push, deploy, delete data or message anyone.
```

Log the contract as the first row:

```bash
LOG append <state>/decisions.tsv --phase contract --decision "overnight run: <goal>" \
  --reason "the user asked for it; trust items 1 to 6 hold" --evidence "<state>/RUN.md, done.sh <hash>" \
  --result "<the predicate's last line>"
```

The `run` column names the conversation that wrote each row, so the audit can find its transcript. In a Claude Code
session `LOG` takes it from `$CLAUDE_CODE_SESSION_ID`; where that is not set, pass `--run <label>` and say in
`RUN.md` which transcript the label stands for.

## Step 3. A fresh worktree

From the main checkout: `git worktree add <worktree> -b overnight/<label> <base>`, with the worktree outside the
main checkout (a sibling folder). For the setup a new worktree needs (dependencies, environment files, ports), use
`parallel-worktrees` if it is installed; without it, install dependencies the way the project's README or CI does.

Then, in the worktree:
1. Run the test command. It passes at the base, or fails only where failing tests are the task.
2. Run the predicate. It fails, with the remaining count you expect.
3. `git status --short` prints nothing. Files the build or the tests write go in the shared exclude file,
   `$(git rev-parse --git-common-dir)/info/exclude`, never in a committed `.gitignore` change.
4. Log a row: `--phase setup`, the worktree and branch, the test and predicate outputs as evidence.

## Step 4. Pick how the run wakes

Read `${CLAUDE_SKILL_DIR}/LOOP.md` now. In short:

| The situation | Use | It needs |
|---|---|---|
| The session stays open (lunch, a long loop at the desk) | keep iterating in this turn, or the built-in `/loop` | the machine awake and the session open; permissions in settings |
| The run must outlive this session | the outer shell loop around `claude -p` in LOOP.md | a machine that stays on; the login and the skill reachable by a headless run |
| The machine will be off | a cloud scheduled task (`/schedule`) | the run branch pushed, which only the user can allow in advance |
| Waiting on an event (CI, a long build) | Monitor or a background Bash command | the session open, and the tool in this session |
| A self check-in at a time | a `send_later`-style tool | the tool in this session's tool list |

`/loop` and session scheduled jobs live inside this Claude process: they end when it exits, and never wake a
`claude -p` that has exited. Never assume a tool exists; look at the tool list. Write the choice into `RUN.md`.

## Step 5. The loop

Each iteration:
1. **Off switch.** If `<state>/STOP` exists, go to step 6.
2. **Read the state**, since a wake remembers nothing: `RUN.md`, `LOG show <state>/decisions.tsv --last 10`,
   `git log --oneline -5` and `git status --short` in the worktree. After a context summary, read them again.
3. **Check the predicate.** `git hash-object <state>/done.sh` matches `RUN.md` (if not, stop: step 6), then run it.
   Exit 0: go to step 6, finished.
4. **Check the budget**: iterations logged, the time, the money spent. Spent: step 6.
5. **Make the smallest change the evidence justifies**, for one idea. Name the idea first.
6. **Verify**: the test command, then the predicate.
7. **Decide.** Keep when the tests pass and the predicate moved (the remaining count fell, or it passes): stage
   only the files you changed and commit (`git add <files>`, `git commit -m "<change>"`). Otherwise revert:
   `git restore -- <files>`, delete files it created, and check that `git status --short` prints nothing. A change
   that "might help" is reverted, not left to ride.
8. **Log one row**: `--phase loop`, the decision (what changed, or what was tried), the reason, the evidence (the
   commit, or `reverted`, and the predicate's last line) and the result (`remaining 7`, `reverted: tests fail in
   test_parse`).

Rules throughout:
- **A plateau is not a stop.** After three reverts in a row, change the approach (read the failure again, try a
  different hypothesis, take a smaller step), and count each approach toward the dead end.
- **Mid-run discoveries** (a related bug, a flaky test, broken tooling): log a row with `--phase discovery`, and
  list it under Attention at the end. Fix it only when it blocks the predicate, in its own commit, with its own row.
- **Never take a forbidden action**, even when a denied command stalls the work. Log it, and if it blocks the
  predicate, stop (step 6).
- **Correct the log, not the story.** A wrong row gets a new row with `--supersedes <id>` saying what is true.
  Never edit or delete a row; `LOG` only appends.

## Step 6. Stop: finished, stuck, out of budget, or switched off

Every stop starts the same way: finish the current step or back it out (never leave half a change), then:
1. **Make the work durable.** Kept work is committed. A half-done change worth keeping goes in one `wip:` commit on
   the run branch, with one line in its body if the tree does not build. Never push.
2. **Write `<state>/resume.md`**, unless the predicate passed: the goal, where the loop is, what is verified, the
   predicate's last line, the next step, key files and gotchas. Point at the log rows instead of copying them.
3. **Log a row**: `--phase stop`, `--decision "stopped: <reason>"`, the resume note or the last commit as evidence.

The reasons, and what each adds:
- **Finished**: the predicate exits 0. Run the tests once more and log both outputs.
- **Dead end (the escape hatch)**: when truly stuck, stop and write up why in `resume.md`: each approach tried, what
  each showed, and what would unblock it. This beats hours of reinterpreting the goal.
- **Budget spent**: say which budget, and how far the predicate got.
- **Off switch**: the user made `<state>/STOP`. "Keep going" or "don't stop" never pauses a run; only the off switch
  or the user saying to pause does.
- **The predicate looks wrong, or the next step needs a forbidden action**: stop and say so. The user decides.

To resume later, a new session reads `RUN.md`, `resume.md` and the log, logs a row under its own run id, and
continues at step 5.

## Step 7. The morning audit

After every stop, before the summary: a fresh reviewer that did not see the run reads the log against the
transcript. It audits the trail (did the log tell the truth), not the code.

1. **Find this run's transcripts, and only those.** Claude Code keeps each session at
   `$HOME/.claude/projects/<slug>/<session id>.jsonl`, where the slug is the session's working folder with every
   `/` and `.` replaced by `-` (print it from the worktree with `pwd | tr '/.' '--'`). The `run` column names the
   sessions; the outer loop also keeps a `--output-format stream-json --verbose` capture of each turn in `<state>`.
   Never glob across `~/.claude/projects/`: the other folders hold the user's other conversations.
2. **Start the reviewer** with the prompt in `${CLAUDE_SKILL_DIR}/AUDIT.md`, filled in. Use a subagent (the Agent
   tool) given only that prompt: it starts without this conversation. Where there is no Agent tool, run a headless
   `claude -p` with the prompt and the read-only rules AUDIT.md lists. Where neither works, audit it yourself and
   say so on the first line of Attention.
3. **Check what it reports**: open the rows and transcript lines it names. It appends its findings to the log with
   `--phase audit`, a gap as a new row and a wrong row as a row that supersedes it.

To grade the result itself against the goal, offer to run `evaluator` if it is installed. Without it, run the
predicate and the tests in the worktree yourself and paste their last lines into the summary.

## Step 8. The summary

Write `<state>/summary.md` and reply with the same text:

```
## Overnight run: <goal>

Verdict:     finished | stopped: dead end | budget spent (<which>) | off switch | predicate wrong | blocked
Predicate:   bash <state>/done.sh -> <last line> (hash unchanged | changed)
Iterations:  <n> (kept <k>, reverted <r>)   Budget used: <iterations, money, time>
Kept:        <sha> <subject>   (one line each)
Reverted:    <count>; the ideas that did not work, in a few words each
Discoveries: <row ids>, fixed (<sha>) or left open
Branch:      overnight/<label> at <sha>, not pushed   Worktree: <path>
Log:         <state>/decisions.tsv (<n> rows, <m> superseded)   Resume note: <path or none>

### Attention
reviewed by a fresh subagent that did not see the run
- <what to look at first> (rows <ids>, or <transcript file>:<line>)
```

The Attention section is last, and lists each flag with the rows or the transcript lines it points at. "No flags"
is a valid list. If no fresh reviewer read the trail, its first line says who did instead.

Leave the branch, the worktree and the state folder in place, and do not push or open a pull request: the user
decides in the morning. If they want the trail with the change, copy the log into the repository once at the end
(`cp <state>/decisions.tsv <worktree>/docs/overnight/<label>.tsv`) and commit it on the run branch.
