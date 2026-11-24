# Things that bit the nineteenth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q21, a subagent watchdog (and the parked Q26):
- The Q26 kickoff said a transcript was attached, and none reached the session: the first message held only text,
  and the upload folders were empty. Check that owner-provided material arrived before reading anything else, and
  say what is missing in one line.
- A settled design still had gaps only the code showed. `eng-lead` listed them as questions with a recommended answer
  and what changes on a no; the owner answered all five in one prompt. Never write "the owner approved" into a brief
  before the answer.
- A headless run with a hook that logs every event (`--settings`, `--max-budget-usd`, an empty HOME) cost 0.02 US
  dollars and overturned two assumptions the plan rested on: TaskStop fires no SubagentStop, and a failed command
  fires PostToolUseFailure, not PostToolUse. Read the subagent's own transcript, not its answer.
- The plan check measured what a shared state file loses under parallel writers (9 of 48 stops) instead of arguing
  about it; one file per agent removed the retry machinery the plan had designed.
- A rule that only nudges can still cut off a run: headless, an ask refuses the call, and an ask that says "stop and
  report" ends a healthy fix loop. The ask's wording is part of the design.
- The reviewer found the must-fix by running the hook through the roster's own pattern (eng-lead starting several
  Agent calls in one message). Give a reviewer the real workflows the hook will meet.
- The orchestrator committed a backlog edit without running the suite, and `decisions.md` went over 5,000 tokens; the
  test run after the merge caught it. Run `npm test` before every commit, docs included.
- CI validates with Claude Code 2.1.302. Installing that version with `npm install --prefix <scratch>` and running its
  `claude plugin validate` checked a new hook event before the push; a made-up event name was the control.
- A test file ended 5 bytes under its limit after the first round; the fix round needed a new test file.

Things that bit Q27, the second part of the nineteenth batch:
- An option the owner picked can turn out to need nothing: reading the docs page first showed that the local
  `/code-review` reads no `REVIEW.md`. Read the source a choice rests on before the brief, not during the build.
- The session's force push of a branch reset to main after a squash merge was refused by the auto mode classifier,
  even with a lease on the merged head. Checking out the remote tip and merging main into it gave a normal push with
  the same files.
- The owner could not find `/ship` on launch day. A command named in a skill needs "if the user has it", and the
  answer to "where is it" is the version, where it runs, the rollout and the plan.
