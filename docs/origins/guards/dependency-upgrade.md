# dependency-upgrade (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Agents asked to "update dependencies" tend to bump many majors at once, regenerate the lockfile wholesale
and fix whatever breaks. The result is one large commit that cannot be bisected or partly reverted, with transitive
upgrades nobody reviewed. Upgrades started on a failing baseline cannot be judged at all, and version numbers recalled
from memory are sometimes wrong or not yet released. The skill makes the safe order explicit: baseline first, research
from primary sources, toolchain before frameworks, one major per commit, and a report of what was skipped or blocked.

**Changes for this release.** None; written for this release.
