# friction-review (Adapted from [`retro`](https://github.com/mattpocock/skills/tree/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/engineering/retro))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: mattpocock/skills `skills/engineering/retro/SKILL.md` at abeeaf9 (MIT), read 2026-11-24. A
`diff -u` of upstream (44 lines) against our SKILL.md (about 120 lines) shares only the frontmatter fences and
`disable-model-invocation: true`: under 5 percent of the text. The method is kept and reworded.

**Problem.** The owner wanted a review loop: read the last 30 sessions, find what slows the agent down, make those
changes, and repeat after the next 30. Upstream `retro` is the method, but it reads one session (the current one by
default), names no path and has no script, so a one-off looks the same as friction that repeats.

**What this version changes.**
- It reads the last N sessions of this project (default 30), or one session by id, and counts each signal as "n in k
  of N sessions" with pointers, so a candidate is something that repeats.
- A script, `friction.mjs`, does the counting: searches before the first edit, empty searches, repeated reads, check
  runs and failures, sessions that edited and ran no check, big tool results, repeated commands, failed calls by
  class. It reuses copies of `agent-friendly-audit`'s folder finding and redaction and `skill-eval`'s
  `extractActions`.
- A project part: the check commands for package.json, Make, pyproject, Cargo and Go, the guardrails, which guardrail
  runs each check (an "unwired check"), "no guardrail" as a finding on its own, and the size of each instruction file.
- Privacy rules: pointers, not quotes; every printed string redacted, with extra patterns for passwords in commands
  and the encoded home folder; refusals printed by class only; synthetic reproductions.
- Upstream's `CODING_STANDARDS.md` and reviewer agent become the folder's `REVIEW.md`, the project's reviewer agent
  and the review-rules checklist. The `writing-for-agents` call is optional.
- The user picks candidates through question groups (at most four per question); each picked change is one commit,
  a new check is proved on a synthetic case first, and nothing is pushed.
- Upstream's Reference section (implementation against review, which file holds what) is folded into `KINDS.md`.

**Why.** One session shows what went wrong once; the owner wanted what keeps going wrong, with counts.

**Q33 (2026-11-25).** Four more navigation lines, to measure whether scattered or oversized files cost turns: files
read in pieces (2 or more Read ranges of one project file in one transcript), new files made with Write inside the
project, new files in commits over the days of the sessions read (git, without merges, renames and root commits, so a
shallow clone does not count every file), and the reads and searches before the first edit in each folder. A shell
command that writes a file is not a read, and a failing git log leaves the commits line "not counted" instead of
ending the report.
