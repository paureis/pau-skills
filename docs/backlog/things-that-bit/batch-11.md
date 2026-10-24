# Things that bit the eleventh batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the eleventh batch (Q13, what Q12 left):
- An eval folder inside the repository is not a sandbox: Claude Code loads the CLAUDE.md files of every parent
  folder, so the eval's assistant, persona and judge all read this repository's own CLAUDE.md. `eng-lead` suspected
  it from reading; a replay with the side folder inside and outside the repository proved it (the old persona prompt
  ended 1 of 4 inside, 4 of 4 outside). Run headless children from a folder outside the repository.
- A control at the wrong place proves nothing. The first replay, outside the repository, showed both prompts ending 4
  of 4. Only the cut and the folder of the original failure separated them.
- A replay of saved transcripts costs cents where a full run costs dollars: 32 persona calls cost under 1 US dollar,
  the full run 6.98. Build the replay before spending on a second full run.
- The plan check built the whole slice in a clone again, ran every mutation, and then found what the table missed:
  four lines of the rule that no test guarded. Ask every plan check to try mutations of its own.
- The worker process restarted once, between the plan check and the owner's answer. The agents' reports and the
  scratchpad survived, and eng-lead and the builder were continued by agent ID.
- `review-scope.mjs fix` run from the main checkout before the merge read the slice as deleted and flagged NO_TEST.
  Run it after the merge, or from where the slice is checked out.
