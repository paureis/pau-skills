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
