# Things that bit the fourteenth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the fourteenth batch (Q17, descriptions that start their skill):
- The cheap rerun was worth running before the expensive one: two turns brought no skill back (0 of 41), which ruled
  out the one-turn limit and kept all ten candidates on the list, for 4.49 US dollars.
- A turn rule tested only with fakes that stop at the Skill call passed while counting the whole transcript; real
  two-turn runs go on after a start. The plan check found it by building the slice. The first real transcript then
  confirmed the rule for free: one reply's thinking and tool blocks share one `message.id`.
- With `--max-turns 2`, claude ends a run that used both turns as `error_max_turns` with `num_turns` 3.
- Keeping a rewriter blind to the lists takes more than "do not open evals/": a failing assertion prints request text,
  a repository-wide grep reaches the lists, and the list test checks a description only against its own list. Test
  output went to a file read through a grep, searches named their paths, and the orchestrator ran the cross-list
  check itself.
- Curly quotes, a backticked skill name followed by "if installed", a changed "Use ..." opener and a quoted remark on
  a confirm-list skill all pass every test. The brief checked them by hand; a test would be cheaper next time.
- A round of 380 runs moves skills whose descriptions did not change by up to 2 hits of 6. Read a per-skill change of
  1 or 2 as noise unless it repeats.
- `eng-lead` handed back at once with each builder's agent ID, as told, and the main session started the reviewers
  and sent the one fix round, as in batches 7 to 13. Both builders' reports came to the main session.
