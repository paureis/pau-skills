# Skill-usage hook, `hooks/session-discipline/skill-usage.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Nobody knew which skills actually ran. A skill that never starts still costs its description in every
session, and a skill the agent starts on its own leaves no trace outside the transcript. The hook writes one line per
start (the time, the name, and whether it was typed or started by the agent, never the prompt), and `which-skill`'s
`usage-report.mjs` turns the log into counts and a list of skills that never started. Built in Q16 with the trigger
mode of `skill-eval`, which measures the same question before a skill ships.

**Changes for this release.** None; written for this release.
