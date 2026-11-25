# Things that bit the twenty-first batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q32, skill-usage typed starts:
- The backlog guessed at the hook input; a probe settled it in minutes. A headless run with an empty HOME and a hook
  that logs every event (`--max-budget-usd`, a small model) costs cents. Use `--settings <file>` with the real HOME
  when the run needs the real synced skills, which an empty HOME does not load.
- Feeding recorded events to a hook by hand: `PAU_SKILLS_HOME` moves the skill and command lookups as well as the
  log, so a control that points it at a scratch log folder hides files under the real home. Point it at the home that
  holds the fixtures.
- `claude plugin validate` reads the hooks copied into `marketplace.json`, never `hooks.json` itself. A made-up event
  in `hooks.json` alone passes; rebuild first, then validate. A made-up key is the control that shows the check is
  real.
- A test that plants a file where a path join would reach cannot catch a missing traversal rule when the file only
  suppresses a line: the mutant skips the name too. Send the bad names with no file planted.
- A fast-return test whose inputs are all rejected by the first check cannot catch a config read moved after it. Give
  it one rejected input per check.
- A typed `context: fork` skill fires `UserPromptExpansion` before `UserPromptSubmit`. Fixtures keep the recorded
  order.
- The `eng-lead` second run came back in the background, as the kickoff expected; handing back the builder's ID at
  once and starting the reviewer from the main session worked.
