# verification

Skills: `tdd` (with `PROPERTIES.md`), `mutation-test` (with `mutate.sh`), `evaluator`, `flaky-test-hunt` (with `repeat.mjs`),
`migration-review`, `ci-cost-and-cadence` (with `measure-minutes.mjs`), `review-triage` (with `TRIAGE.md`,
`review-scope.mjs`, `review-scope-rules.mjs` and `review-scope-checklist.mjs`), `bug-fix` (with `EVIDENCE.md`), `verify-app` (with `check-map.mjs` and
`check-map-rules.mjs`, `DRIVING.md`, `MAINTAIN.md` and templates, `templates/measure-boxes.js` among them), `hillclimb`
(with `decisions.mjs`, `decisions-core.mjs`, `decisions-log.mjs`, `HARNESS.md` and `BENCHMARK-CHECKLIST.md`),
`skill-eval` (with `skill-eval.mjs` and its modules `skill-eval-core.mjs`, `skill-eval-files.mjs`, `skill-eval-setup.mjs`
and `skill-eval-blind.mjs`, `ISOLATION.md` and `JUDGE-BRIEF.md`, and the trigger mode in `skill-eval-triggers.mjs`,
`skill-eval-triggers-count.mjs` and `TRIGGERS.md`), `launch-readiness` (with `ledger.mjs`, `table.mjs`, `rules.mjs`, `areas/`, `PROBES.md`,
`QUESTIONNAIRE.md`, `READINESS-TEMPLATE.md` and `PRODUCTION-RULES.md`, whose copies `project-setup`, `rule-to-hook` and `geppetto` carry). Hooks: `test-tamper-guard`, `suppression-reason` and `verify-before-done`.

All three hooks are on when the plugin is installed. To turn one off or change how it behaves (for example, make
`test-tamper-guard` refuse instead of ask, or tell `verify-before-done` about a check it does not recognise), see
[hooks/README.md](../../hooks/README.md).

## review-triage configuration

Optional `.claude/review-rules.json` in the project root, shared with `lean-subagent-dev` in agent-orchestration.
Every key is optional:

```json
{
  "mustFix": ["sentences naming failures that block a merge in this project"],
  "riskyPaths": ["globs of the code where a small fix can break more than it repairs"],
  "checks": ["the commands that prove the project still works"],
  "testPaths": ["globs that mark a file as a test"],
  "docPaths": ["globs that mark a file as documentation"],
  "delegation": { "budget": "normal", "minFiles": 3, "log": "docs/delegation-log.md" },
  "checklist": [{
    "trigger": { "paths": ["db/migrations/**"], "added": "drop\\s+table", "flags": "i" },
    "check": "what the reviewer verifies, in one or two sentences",
    "why": "the incident, pull request or commit behind it"
  }]
}
```

`mustFix` is added to the defaults: a security hole, data lost or written to the wrong place, a wrong result on the
main path, a broken build, install, test run, typecheck or lint, and a failed contract or acceptance criterion.
`testPaths` and `docPaths` replace the defaults. `delegation` is read only by `lean-subagent-dev`. An unknown key is an
error. To see the effective rules: `node skills/verification/review-triage/review-scope.mjs config` from the project
root (or the path to the plugin's copy).

`checklist` entries are printed by `change` and `fix` only when the diff triggers them: `paths` when a changed file
matches a glob, `added` (JavaScript regex syntax; `flags` may only be "i") when an added line matches, and both
together when a matching line is in a matching file. An invalid glob or regex is an error. A regex that times out
after 1 second or fails, or a diff over 64 MiB, prints its entry as triggered, to check by hand. A file git treats as
binary has no added lines for `added`.

`change` and `fix` read `.claude/review-rules.json` as committed at the merge base, the commit the change started
from, so a change cannot loosen the rules that judge it; `config` still shows the working tree's file. Commit the file:
an uncommitted or git-ignored one is not used, and the output says `Rules: the defaults`. An optional `REVIEW.md` in
any folder says what a reviewer of the code under that folder must check; `change` lists the ones above each changed
file at the merge base, nearest folder first, each with the `git show` command that prints it. A `REVIEW.md` next to a
`SKILL.md` is that skill's own file and is skipped. A change that edits the rules file, a `REVIEW.md`, or a file a
`checks` command or checklist `check` names word for word is flagged `RULES`: `change` prints it and exits 0, `fix`
raises it (exit 1).
