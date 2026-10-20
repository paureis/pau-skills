# review-triage and `review-scope.mjs` (Original; learned patterns and two triage rules adapted from [pstack `bugbot-triage.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/references/bugbot-triage.md))

Back to the [origins index](../../ORIGINS.md).

Written in one of my projects on 2026-10-15, as that project's rules for reviewing a change. The rating idea came from
a "value against effort" chart in a post I read: each candidate change placed by value and effort, shaded by risk, and
labelled "judgement, not measurement". No text was taken from anywhere.

**Problem.** AI reviews over-verify. They can always find one more thing, and each fix can bring a new bug, so the
review and fix loop does not end by itself. The project needed limits on what was worth changing: a finding has to
name a failure (this input, this wrong result) or it is a preference; findings go to must fix, fix if cheap, or leave;
the risk of the fix is weighed as well as the problem, because a small fix in the riskiest code can break more than it
repairs; every fix has a test that fails without it; the second look covers only the fix; and there is one review
round and one fix round.

**Evidence so far.** Two real runs, on 2026-10-16. A release preparation touching 7 files: one review round, nothing
met the bar, no fix round. A feature of about 600 lines across 11 files: one finding, a misleading message, rated
fix if cheap and fixed test first in one fix round; the second look covered only the fix. That finding came from
asking the implementer to list anything it was unsure about. Not yet seen: a must-fix found in review, or a fix that
caused a new bug, which is the case the round limit exists for. In the same project, a reviewer that checked the plan
against the real environment before anything was built found a real design gap, which is why the method says review
before building pays more.

**Changes for this release.** The project's must-fix list and its risky files became configuration in
`.claude/review-rules.json`, with defaults that hold for any project. The rating became low, medium or high instead of
1 to 5, and is never turned into a score. Added: the check that a claimed impossible state really is impossible, the
rule that an unsettled security finding goes to the maintainer, the rule that a repeated finding stays left, the
reviewer prompt, and `review-scope.mjs`, which prints the rules, scopes the change and flags a fix round with no test,
in risky code, or outside the change. `TRIAGE.md` and the script are shared with `lean-subagent-dev`, which carries
identical copies.

**pstack additions (2026-10-17).** Closest upstream: `skills/poteto-mode/references/bugbot-triage.md` and
`skills/interrogate/references/lead-judgment.md`. The whole `TRIAGE.md` shares about 1% of its word 6-grams with them
(24 of 2,094), all in the added text: the field labels of the pattern template and two phrases. `SKILL.md` shares
none. What this version changes:
- "I would have done it differently" (lead-judgment) becomes a bullet in section 1: it names no failure until it shows
  a concrete problem, and goes to Leave with the reason written down. With a problem shown, that problem is the
  finding. A security concern dressed as an alternative goes by the security rule.
- Nitpick gravity (lead-judgment) is placed after the bucket table as a conclusion about the whole review, reached
  only after every finding went through step 2. It is not a bucket, and it does not apply while any finding that names
  a failure is still open, or when any finding is a must-fix. Upstream's "Hypothetical vs. Actual", "Premature
  abstraction" and "Missing context" were already covered by steps 1, 2 and 4, so they were not taken.
- The learned-pattern format (bugbot-triage) keeps its five fields and three levels. Bugbot and pull request threads
  go away: patterns live in a file the maintainer agrees to (for example `.claude/review-patterns.md`), the agent may
  add a candidate, and recurring or strong needs the maintainer's yes. A pattern does not replace checking the claim:
  a recurring or strong pattern sends a finding to Leave only when step 2 did not reproduce or trace the failure
  (upstream: dismiss only when the current code or context proves no change is needed). A reproduced or traced
  failure, and a "fix by default" pattern, take their bucket from section 4; a candidate is a hint, not a skip.
  Upstream's fix, dismiss and ask classes are not taken; the three buckets stay.
- The "ask by default" list becomes "no pattern ever skips these", with the must-fix list added on top: a learned
  pattern never turns a must-fix into a leave. A person's dismissal of a security finding is an owner's call, not a
  pattern. Upstream's example patterns (UI changes, stacked pull requests, browser behaviour) are not taken.
- The reviewer prompt asks the reviewer to say so when it finds nothing serious, instead of filling the list with
  nits. The report gains "Nitpick gravity" and "Learned patterns" lines.

The review of this change found that a learned pattern could send a reproduced failure to Leave; the rule above is the
fix.
