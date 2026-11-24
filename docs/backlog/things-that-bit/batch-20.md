# Things that bit the twentieth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q28 to Q31 (typed-only skills, friction-review, small additions from upstream, patch notes):
- The plan check measured the size targets before the build and found three files already over the target eng-lead
  set (README, `which-skill`, a test file). Moving `which-skill`'s hook table into a bundled `HOOKS.md` and splitting
  two test files made room; ask for `wc -c` of every file a slice grows in the plan, not after it.
- `claude plugin validate --strict` accepts any frontmatter key, even a made-up one, so it proves nothing about
  `disable-model-invocation`. The evidence was the owner's claude.ai test and a headless probe: `claude -p "/name"`
  starts a typed-only skill, a request in words is refused.
- The owner's rule ("a skill another skill starts stays model-invoked") cut the typed-only list from 14 to 7. Build
  the start map from every file of every skill, in every phrasing; a grep for "use, run, start or offer" missed some.
- A typed-only skill cannot be loaded by a headless turn prompted in words, so `overnight-run` copies its SKILL.md into
  the control folder. Check what else starts a skill before it becomes typed only: loops, scheduled prompts, roster
  agents.
- friction-review's first review found a token after a newline in a heredoc printed raw: `targetOf` turns newlines into
  the two characters `\n`, and the redact patterns anchor on a word boundary. Redact the text with real newlines, and
  test with commands as an agent writes them, not one-line samples.
- Refusal text from a hook or the user printed in full because the test used a made-up shape. Take the shapes from the
  real binary or a real transcript.
- A `claude --bg` session edits in its own worktree (`worktree.bgIsolation`), branched from the remote's default
  branch (`worktree.baseRef`); neither shows in `--help`. The plan check found it by reading the installed binary.
- The release-notes image check went line by line, so a wrapped alt text, nested brackets or a reference in a
  blockquote let an outside GIF through. A check on Markdown reads the whole text.
- `gh api markdown` and `gh api emojis` are refused from a session (repository-scoped endpoints only), so emoji
  shortcodes could not be rendered before the merge.
- Four builders ran at once on disjoint files from one base; the orchestrator merged each after its own review and
  fix round, and kept the shared files (ORIGINS, NOTICE, REFERENCE, CHANGELOG) to itself. No merge conflicted.
- A replace script that requires each old text to occur exactly once caught a NOTICE edit that would have landed in
  the wrong license list.
- CI on macOS failed one release-notes test that passed on Linux: the fixture wrote `v0.9.0.md` and `V0.9.0.md` into
  one folder, and on macOS's case-insensitive file system the second overwrote the first. Fixture file names in one
  folder must differ by more than case.
