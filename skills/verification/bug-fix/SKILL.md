---
name: bug-fix
description: "Fix a bug at its root cause with runtime evidence: reproduce it twice, test one hypothesis at a time, commit a failing test before the fix. Use for 'fix this bug', 'this is broken', 'why does X return Y', a crash or wrong output that shows every time; a failure that comes and goes needs counted runs instead."
argument-hint: "<the bug report: what you did, what you expected, what happened, where>"
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/bug-fix.md
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
---

# Bug fix

Fix the first wrong decision the code made, not the place where it became visible, and ship only what runtime
evidence justifies. Reading code tells you where to look. Running it tells you what is true.

The bug: $ARGUMENTS

Reference, read when a step points to it: `${CLAUDE_SKILL_DIR}/EVIDENCE.md` (how to reproduce on each kind of
surface, how to get runtime evidence in each language, `git bisect`, checks on the observation itself, and how to
commit a failing test in each ecosystem).

## Rules that apply throughout

- **Every shipped line traces to runtime evidence.** A change that "might help" is a hypothesis, not a fix, and it
  does not ship. When evidence refutes a hypothesis, revert everything that hypothesis motivated.
- **Work on a branch.** Before the first commit, if you are on the default branch, create a branch for the fix.
  Never check out another version over the user's uncommitted changes; use a separate worktree
  (`git worktree add <dir> <rev>`) or a clean clone.
- **One hypothesis, one change, one observation at a time.** Two changes between observations cannot be told apart.
- **No baseline, no claim.** If the bug did not reproduce twice before the fix, nothing after the fix can show that
  the fix worked.
- **Do not hide the bug.** A guard, retry, caught and ignored error, clamped value, default fallback or dropped record
  added where the symptom appeared is a fix only if the state it handles is legitimate (step 4).
- **Failures that come and go are a different job.** If the bug shows on some runs and not others with the same
  input, use `flaky-test-hunt` if it is installed. Without it, count failures over many runs (to see a failure with
  probability p, run about 3/p times) and prove the fix with the same count of clean runs, not with one green run.

## Step 1. Pin down the report

Write down, from the report, the repository and the user (ask only what they cannot answer):
- the exact input or actions, the environment (version, OS, configuration, data), and when it started;
- what was expected and what happened instead, with the real error text or output;
- the **discriminating observation**: one thing you can look at that differs between broken and fixed (a value in
  the response, an exit code, a line in the log, an element on the page). Every later check looks at this.

Then look for a fix that already exists: open pull requests that touch the code or mention the symptom
(`gh pr list --search "<words from the error>"` on GitHub, or the forge's equivalent), and recent commits on the
default branch and other branches (`git log --all --since=<date> --grep=<word>`, `git log --all -- <file>`). If one
plausibly fixes it, go to "When a fix already exists" below instead of writing a second fix.

## Step 2. Reproduce it twice on the real surface

The real surface is where the user met the bug: the page in a browser, the command in a terminal, the endpoint of the
running service, the public function of the library called from a small program, the app on a simulator or device.
`EVIDENCE.md` has how to drive each one.

1. Reproduce it yourself. Ask the user to do it only for a stated, specific reason you cannot reach the surface (a
   device you do not have, a production account), and only after driving it as far as it goes.
2. Reset the state (restart the process, clear the cache, recreate the data) and reproduce it again. Two runs from a
   clean state are the baseline.
3. Save the exact commands or steps and the broken output. This is the repro.
4. If it does not fire, make it fire: build the trigger yourself (the input, the data, the timing), tighten the
   conditions to match the report, or add logging until you see the path it takes. If it still does not fire after
   that, stop with the verdict **not reproduced** (step 9). Do not fix a bug you cannot see.

Then shrink the repro to the smallest automated check that still shows the discriminating observation, usually a
test at the lowest level that still fails for the reported reason. Keep the surface repro for step 8.

## Step 3. Test hypotheses with runtime evidence

List the candidate causes. Seed the list from the code path the repro takes, and from history: what changed in that
code and when (`git log -p` on the files, `git log -S'<text>'`), and if an older version is known to work,
`git bisect` with the repro as the test (`EVIDENCE.md`).

Then rule them out one at a time. Each round, pick the test that removes the most remaining causes, the way a binary
search halves the range: is the value already wrong when it enters this function, or does this function make it
wrong? Before you run it, write what you expect to see if the hypothesis is true and if it is false. Then get the
evidence from the running program: a log line, a debugger breakpoint, a trace, a print statement. Do not settle a
hypothesis by reading code.

Keep a log, in the conversation or a scratch file outside the repository:

| # | Hypothesis | Prediction if true | Prediction if false | Evidence (command and output) | Verdict |
|---|---|---|---|---|---|

A verdict is `confirmed`, `refuted` or `open`. A row is `confirmed` or `refuted` only with pasted output in the
evidence column. Note every edit a hypothesis made (instrumentation, a trial change) so step 7 can remove it.

Done when one mechanism survives, confirmed by runtime evidence that shows the discriminating observation going
wrong at a specific line.

## Step 4. Find the first wrong decision

The symptom is where a wrong state became visible. The root cause is the first place the code did something it
should not have, or failed to handle a state it should handle. From the confirmed mechanism, ask "why" at each step
until the answer is a decision in the code, not a consequence of an earlier one.

Then ask: **is the state that triggered the symptom legitimate?**
- If the system may be in that state (an empty list, a missing optional field, a slow network), the code that broke
  on it is the root cause, and handling the state there is the fix.
- If the state should never exist, a check where it broke hides the bug. Go back and find what produced the state.
  An index that is one too large, a field that was never set, a record saved twice: fix the producer.

Two more checks:
- If it fails only after a restart or on a second run, suspect persisted state first: config files, caches, lock
  files, databases, serialized state.
- Search for the same fault elsewhere (the same call, the same pattern, the same copied block). Fix every instance or
  list the ones you leave.

## Step 5. After two failed fixes on one premise, attack the premise

This step starts when two fixes that rest on the same premise have both failed step 8. Suspect the premise, not the
fixes.

1. Write the premise down: the one sentence every failed fix assumed ("the config is loaded before the handler
   runs", "this function only receives sorted input").
2. Test it directly before writing another fix. Find an observation that would come out differently if the premise
   were false, and make it. Look at how the failures are spread (which inputs, which runs, which side of a boundary),
   not only at how large they are.
3. If the evidence contradicts the premise, the cause is elsewhere: look at what the failures share that the premise
   did not predict, and go back to step 3. If it confirms the premise, the earlier fixes probably treated a
   consequence; go back to step 4 and ask the next "why".
4. Revert both failed fixes before the next attempt. They are refuted hypotheses.

Do not start a third fix until the premise is written down and tested.

**Suspect the observation method too.** When a check passes too easily, or a fix that cannot have worked seems to
work, check the check before trusting it: the build you are running is the one you changed, the process restarted,
no cache answered, the test ran and was not skipped, you are looking at the right environment. The quickest proof
is to break it on purpose and watch the check go red. `EVIDENCE.md` has the list.

## Step 6. Commit the failing repro first

Write the automated check from step 2 as a test that fails now, for the reported reason (its failure message shows
the discriminating observation, not a setup error). Run it, watch it fail, and commit the test file on its own (no
build output, no instrumentation), before the fix, so the history shows the bug and then its fix. `tdd` covers
writing the test, if it is installed; without it, match the project's test layout and assert behaviour through the
public interface.

If the project does not accept a red commit, mark the test as expected to fail in the runner's own way and remove the
marker in the fix commit (`EVIDENCE.md`). A marker accepts any failure, including a typo or a setup error, so read the
unmarked failure output first, confirm it shows the bug, and pin the expected error or message where the runner
allows it (pytest `raises=`, Rust `should_panic(expected = ...)`).

If an automated test would be expensive or unclear (a visual glitch, a device-only bug), commit the repro script or
the written steps instead and say so in the report.

## Step 7. Make the smallest fix the evidence justifies

Change the first wrong decision from step 4, and nothing else. Then read the whole diff and remove every hunk that
does not trace to a confirmed row in the hypothesis log: instrumentation, trial changes from refuted hypotheses,
"while I was here" edits, defensive checks no evidence asked for.

Run the test from step 6 and watch it pass. Then commit the fix on its own, on top of the test commit, removing the
expected-failure marker in the same commit if step 6 added one. Commit before step 8: the report names this commit,
and `mutation-test` (if it is installed) refuses a dirty tree.

## Step 8. Prove it, and prove what it cannot break

1. The failing test from step 6 now passes. Its failing run at the step 6 commit is the run with the fix undone; if
   the test changed after that commit, undo the fix once and watch it fail again, then restore it. `mutation-test`
   does this with each step checked, if it is installed.
2. The surface repro from step 2, from a clean state, twice: the discriminating observation now shows the expected
   result. Unit tests show what one branch does, not that the bug is gone. A run on a different surface, or one that
   could not show the observation, is **inconclusive**, not a pass.
3. The project's full test suite passes.
4. **Blast radius.** Name the one fact the change is safe because of ("this branch only runs when the list is
   empty", "no other caller passes a negative offset"). Push your proof of it as far down this ladder as is cheap,
   and report where it stopped:
   1. you said so (worth nothing on its own);
   2. you pointed at the line (a real `file:line`, or the library's own source);
   3. you walked the bad case step by step and showed it cannot happen;
   4. you ran it: a test or script that calls the real code and fails loudly if you are wrong;
   5. you reproduced it in the running app.

   Look where a text search stops: data already stored in the old shape, a wire format or file another program
   reads, another language reading the same bytes, a feature flag, a caller three hops away. Note what the change
   leaves as it was (other bad inputs that behaved wrongly before and still do) under "Not done".

If the fix fails 1, 2 or 3, revert the fix commit (`git revert`; it was a refuted hypothesis) and go back to step 3,
or to step 5 when it is the second failed fix that rests on the same premise. If the blast radius check in 4 shows
the change is not safe (a caller relies on the old behaviour, stored data has the old shape), revert the fix commit
and go back to step 4 with that fact: the fix point or the fix has to change. If no safe fix is within reach, stop
with the verdict **reproduced, not fixed** and report the fact.

For an independent check, `evaluator` attacks the fix from a fresh context, if it is installed. Without it, ask a
fresh subagent (Agent tool) that has not seen your work to break the fix, given only the bug report, the repro and
the diff.

## Step 9. Report

```
## Bug fix: <one line>

Verdict:      fixed | not reproduced | reproduced, not fixed | inconclusive
Symptom:      <discriminating observation, expected vs actual>
Repro:        <surface, command or steps>; reproduced <2/2> before the fix
Root cause:   <file:line, the first wrong decision, and why the state was or was not legitimate>
Hypotheses:   <the log, or its confirmed and refuted rows>
Fix:          <what changed>; reverted: <what refuted hypotheses had added>
Proof:        failing test <name> committed in <sha>, passes after <sha>; fails again with the fix undone: yes/no
              surface repro after the fix: <2/2 expected result>; full suite: <pass/fail>
Safe because: <the one fact>, proven at rung <n>: <proof>
Signal:       <the cheap, always-on check that would have shown this at first look: a log line, an assertion,
              a metric, a type, a lint rule>
Not done:     <other instances left, related risks, anything for the user>
```

Paste the failing and then passing output verbatim under the report. **Inconclusive is not a pass**: say which half
(before or after) could not be measured and why. Not reproduced means no fix was made. **Reproduced, not fixed**
means the bug showed twice but no fix passed step 8: give the root cause if you found it, the hypotheses ruled out,
and the state of the branch.

If you stop after step 6, the branch has a commit with a failing test. Either keep the test marked as an expected
failure (`EVIDENCE.md`), so the branch is green and the test turns red when someone fixes the bug, or leave it red and
tell the user in the report that the branch has a failing commit, with its sha. Never delete the test to get green.

## When a fix already exists

If an open pull request or a commit claims to fix the bug, verify it instead of writing a competing fix. Check out the
version without it (the pull request's base, or the commit before the fix) and the version with it each in its own
worktree (`git worktree add <dir> <rev>`) or clean clone, never over the user's working tree, and remove them after.
Run the repro twice on each, in the same environment and data, on the real surface.
- Reproduces twice before and is gone twice after: **fixed**.
- Shows on both versions: **reproduced, not fixed**; say so and link the change.
- The baseline does not reproduce, the patched version cannot run, or the observation cannot be seen: **inconclusive**.

## When to stop and ask

- It does not reproduce after the attempts in step 2.
- No fix passes step 8 after the premise is tested: report **reproduced, not fixed**, and handle the committed test
  as step 9 says.
- The only fix you can find hides the state (a guard, retry or fallback) and you could not find what produces it.
- The fix changes behaviour other code or users may rely on, or the root cause is in a dependency or service you
  cannot change.
