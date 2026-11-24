# handoff (Original)

Back to the [origins index](../../ORIGINS.md).

0 of 770 word 6-grams appear in any upstream version, including upstream's `handoff` and `claude-handoff`, which take
a different approach (a document in the OS temp directory, or a background agent).

**Problem.** Sessions end mid-work, and the next one has no context. The retrospective gate (Step 0) was added because
the retrospective was the step that got squeezed out between finishing the work and handing off, even when a written
rule required it. The approval gate lets the resumed session read and run read-only checks before asking.

**Changes for this release.** It names the plugin-qualified retrospective skill. Nothing else.

**Later changes (2026-10-18).** An idea from the pstack session-pickup playbook (treat the trail as the record, do
not redo finished work, verify inherited claims), in new words: the handoff's top block carries the resume rule, each
claim carries a cheap "How to check" that exercises it, a check ends as holds, false or could not check, and only
reading checks and tests marked safe run before approval. Checks are limited to cheap ones because the playbook
contradicts itself on re-running a repro. It also fixes a dangling reference to "first commands listed below".

**Later changes (2026-11-24, Q30).** An idea from upstream `claude-handoff` (unfinished upstream, abeeaf9), in new
words (0 of 350 new word 6-grams shared): a Start now mode writes the park file and runs
`claude --bg --name "<name>" -- "$(cat "<file>")"`, only on the user's explicit ask and a yes to the shown command. It
parks when there is no `claude` or no `--bg`. It also says that a background session cannot edit this checkout by
default and starts its worktree from the remote's default branch (`worktree.bgIsolation`, `worktree.baseRef`). Not
taken: the OS temp folder and the suggested-skills section.
