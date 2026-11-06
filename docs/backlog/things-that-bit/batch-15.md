# Things that bit the fifteenth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the fifteenth batch (Q18, tests for the description rules checked by hand):
- A done-when grep for non-ASCII characters over an edited file failed at the base: `tests/confirm-step.test.mjs`
  already holds a raw en and em dash inside its "no dash" regex. Check a done-when command at the base before the
  brief goes out; the plan check did.
- A test that compares two files' regex sources lets a flag drift: `/x/g` is a prefix of `/x/gu`. Compare the source
  and the flags, and check that the next character is not a letter.
- `new RegExp(re.source, 'g')` drops the other flags of `re`; build it with `re.flags` plus `g`.
- Fixtures that use the check's own constant (a list of look-alike characters) cannot catch a change to that constant.
  Keep fixture lists literal in the test.
- The review still found six mutations no fixture caught after the plan check's 16: the first phrase, the first and
  last character, a start check that a later check hid. Ask for fixtures at both ends and at position one.
- The worktree guard refused every `sed` form that carries a non-ASCII character (`sed -f`, a computed script, shell
  variables). A `node -e` that builds the sed script with `String.fromCharCode`, piped into `mutate.sh`, worked.
- The container restarted during the builder's proofs. Its commits and worktree survived, and SendMessage to its agent
  ID resumed it, as in batches 5 and 7.
- `eng-lead` handed back at once with the builder's ID, as told, and the builder's reports came to the main session,
  as in batches 7 to 14.

Things that bit Q19, the second part of the fifteenth batch:
- The orchestrator's own correction put the bad skill last in the only multi-skill fixture, so a rule that read only
  the last skill passed every test. Put a bad case first, in the middle and last, whatever the list is.
- A sweep of every BMP code point at three places runs in under a second here and caught range mutations a hand list
  missed. Astral characters cannot be swept that way; sample several, not only the ends.
- mutate.sh strips carriage returns before it compares, so it cannot apply a mutation that adds one. Make that change by
  hand in a clone.

Things that bit Q20, the third part of the fifteenth batch:
- A regex alternative that can match the same text two ways (a quoted value, or a bare value that may start with a
  quote) backtracks exponentially on input that does not match. The plan check and every listed mutation missed it;
  the reviewer found it by timing commands with many flags. Time a new pattern on long non-matching input.
- A test for a pattern that can hang runs the pattern in a child process with a kill timeout, so the old code fails in
  seconds instead of hanging the suite.
- The orchestrator settled the file layout (a third test file) before the plan check, so the plan check built and
  counted the right shape.
