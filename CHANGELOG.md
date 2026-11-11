# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-11-11: Q22, two hooks that get in the way

- `verify-before-done` (verification 0.14.2, `pau-skills-hooks` 0.4.2) counts a check script run through an
  interpreter or directly (`bash tools/check.sh`, `pwsh -File scripts/test.ps1`, `./scripts/verify.mjs`), the Lua
  tool checks (`lune run tests/run`, `luau-lsp analyze`, `selene`, `stylua --check`), and every command under
  `checks` in `.claude/review-rules.json`, also after a separator or a `timeout` prefix. Inline code after an
  interpreter (`bash -c`, `node -e`, `pwsh -Command`, `python -m`) is not a script. The block message says how to
  name a check it missed. A task notification that arrives while the session is idle no longer hides the edits made
  before it, and after the hook has sent the agent back once it does not send it back again for the same edit.
- `no-idle` (agent-orchestration 0.11.3, `pau-skills-hooks` 0.4.2) no longer changes an `Agent` or `Task` call's
  input by default: in auto mode the changed input made the desktop app refuse the launch and ask for it again. The
  rule now arrives only as start-up context (SubagentStart), which two headless runs showed reaching launches in the
  foreground, in the background, in a worktree and as a fork. `{"no-idle": {"rewritePrompt": true}}` in
  `.claude/pau-skills.json` turns the prompt rewrite back on, except for a call in auto mode.
- The bundle goes to 0.18.2. The entries of 2026-11-04 to 2026-11-06 moved to `docs/changelog/2026-W45.md`, since
  week 45 had ended.

## Older entries

Each earlier ISO week is in its own file in docs/changelog/, named `<year>-W<week>.md`; a week too large for one file
goes on in `<year>-W<week>-2.md`.

- [2026-W45: 2026-11-02 to 2026-11-08](docs/changelog/2026-W45.md)
- [2026-W44: 2026-10-26 to 2026-11-01](docs/changelog/2026-W44.md)
- [2026-W43, second part: 2026-10-23 to 2026-10-25](docs/changelog/2026-W43-2.md)
- [2026-W43: 2026-10-19 to 2026-10-22](docs/changelog/2026-W43.md)
- [2026-W42: 2026-10-12 to 2026-10-18](docs/changelog/2026-W42.md)
- [2026-W41: 2026-10-05 to 2026-10-11](docs/changelog/2026-W41.md)
- [2026-W40: 2026-09-28 to 2026-10-04](docs/changelog/2026-W40.md)
