# session-close (Original)

Back to the [origins index](../../ORIGINS.md).

Generalized from a project's session-close skill.

**Problem.** The loop I wanted was work, reflect, prepare the next session, as one command. Done by hand, steps got
skipped, the retrospective most often. The skill fixes the order and makes each skipped step say why. Two details come
from real failures: times are taken from the machine clock because a close once logged 02:40 of the next day for
22:40 (it read the UTC `Z` of an agent notification), and the handoff always names the models used so a silent model
change is noticed.

**Changes for this release.** Paths come from `.claude/roadmap.json` (shared with the roadmap hook) instead of fixed
project paths; project-specific checks (a linked cloud project, a CI skip script, named people to ask) became generic
steps ("if the project records a linked-environment invariant, check it").
