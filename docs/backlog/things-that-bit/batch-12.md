# Things that bit the twelfth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the twelfth batch (Q14, what Q13 left):
- `eng-lead` has no Write tool, so its brief came back inside its handback, which is a tool call, not a text block. A
  script that searched only text blocks found nothing; one that searched every string in the transcript wrote the
  brief to a file without reading the transcript into the main session.
- The plan check's 25 planned mutations were all caught, and its own mutations still found eleven problems: a fake
  cost table where a judge call rounded first gave the right total, a `cwd === home` check that a judge in the
  project folder passed, and untested `--baseline`, relative `--out` and refused-scenario paths. Pick fake values so
  that each wrong sum lands on a different number, and check each one with node before the brief goes out.
- Node 22 runs `node --test a b missing` with no error when other paths match, so a done-when that lists a new test
  file passes before the file exists. State the expected `# tests` count in the brief.
- Tests that make folders through the code under test leaked `project-setup-eval-*` folders into `/tmp` when a
  mutation made `main` throw. Point TMPDIR at a test folder before the import.
- Builder worktrees sit inside the main checkout (`.claude/worktrees/agent-<id>`), so a check for "inside the
  repository" run from a worktree misses the main checkout's CLAUDE.md. The reviewer found it; the fix checks for a
  CLAUDE.md in every parent folder instead.
- A JavaScript default parameter replaces an explicit `undefined`, so a fake that must leave a field out takes `null`.
- `review-scope.mjs fix --repo <worktree>` before the merge worked and showed no false NO_TEST (batch 11 ran it from
  the main checkout).
- Both `eng-lead` runs went to the background although the call asked for the foreground; the builder it started did
  too, and its report reached the main session, as in batches 7 to 11.
