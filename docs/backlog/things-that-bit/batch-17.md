# Things that bit the seventeenth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q23, the lazy senior developer, adapted from ponytail:
- A popular upstream's own numbers and examples are claims. A subagent that read its benchmark results found two
  featured examples unsafe by its own safety benchmark and several headline numbers unsupported; the method was taken,
  the numbers and examples were not. Read the results files, not the README.
- Both plan checks found unsafe guidance the plan had written itself: a `shortcut:` comment that could excuse a
  security cut, money kept as a binary float, no rule against hand-rolled parsers. A rule about writing less code needs
  its never-cut list everywhere it is quoted, not only in one file.
- A text kept in sync across files (the ladder in RULES.md, builder.md and two installed copies) drifted unnoticed in
  the mutations until a byte-for-byte test of installed agents and an agreement test were added.
- `skill-eval` can compare a hook's text by giving one variant the text in its prompt; the blind copies show the judge
  what a run did, not its prompt. 18 Haiku runs and three judge passes cost 0.10 US dollars.
- The blind read the skill asks of the orchestrator went to one fresh subagent per lab, kept away from the key, which
  kept the orchestrator's context small.
- `node --test a b` and `mutate.sh` patterns went stale after a fix round moved lines; three planned mutations had to be
  rewritten before they applied again.
- The auto mode classifier refused a push of the planning commit; the push waited for the owner.
