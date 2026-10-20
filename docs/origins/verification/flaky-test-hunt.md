# flaky-test-hunt and `repeat.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

**Problem.** Agents and people label an intermittently failing test "flaky" and then add a retry, raise a timeout,
add a sleep or quarantine the test. The signal goes quiet but the cause stays, and sometimes the cause is a real race
or date bug in the product. Claims that a fix worked usually rest on one or two green runs, which says almost nothing
about a failure that happens one run in twenty.

**Changes for this release.** None; written for this release.

**Later changes (2026-10-18).** An idea from the pstack babysit playbook (classify a CI failure before a retry), in
new words: fetch and deepen first; a failure in code the branch never touched suggests a stale base, checked against
the base CI actually tested (a pull request's merge commit names it); one re-run at most, as a diagnostic, and a CI
re-run only when asked; two identical failures end the hunt only when CI history and a few local runs agree, since a
one-in-three flake fails twice in a row one time in nine. A cold run showed the description did not start the skill
for a failed CI run someone wanted to retry, so it now names that situation.
