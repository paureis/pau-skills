# verification

Skills: `tdd`, `mutation-test` (with `mutate.sh`), `evaluator`, `flaky-test-hunt` (with `repeat.mjs`),
`migration-review`, `ci-cost-and-cadence` (with `measure-minutes.mjs`), `review-triage` (with `TRIAGE.md`,
`review-scope.mjs` and `review-scope-rules.mjs`), `bug-fix` (with `EVIDENCE.md`), `verify-app` (with `check-map.mjs` and
`check-map-rules.mjs`, `DRIVING.md`, `MAINTAIN.md` and templates, `templates/measure-boxes.js` among them), `hillclimb`
(with `decisions.mjs`, `decisions-core.mjs`, `decisions-log.mjs`, `HARNESS.md` and `BENCHMARK-CHECKLIST.md`),
`skill-eval` (with `skill-eval.mjs` and its modules `skill-eval-core.mjs`, `skill-eval-files.mjs`, `skill-eval-setup.mjs`
and `skill-eval-blind.mjs`, `ISOLATION.md` and `JUDGE-BRIEF.md`), `launch-readiness` (with `ledger.mjs`, `table.mjs`, `rules.mjs`, `areas/`, `PROBES.md`,
`QUESTIONNAIRE.md`, `READINESS-TEMPLATE.md` and `PRODUCTION-RULES.md`, whose copies `project-setup`, `rule-to-hook` and `geppetto` carry). Hooks: `test-tamper-guard`, `suppression-reason` and `verify-before-done`.

All three hooks are on when the plugin is installed. To turn one off or change how it behaves (for example, make
`test-tamper-guard` refuse instead of ask, or tell `verify-before-done` about your project's own check script), see
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
  "delegation": { "budget": "normal", "minFiles": 3, "log": "docs/delegation-log.md" }
}
```

`mustFix` is added to the defaults: a security hole, data lost or written to the wrong place, a wrong result on the
main path, a broken build, install, test run, typecheck or lint, and a failed contract or acceptance criterion.
`testPaths` and `docPaths` replace the defaults. `delegation` is read only by `lean-subagent-dev`. An unknown key is an
error. To see the effective rules: `node skills/verification/review-triage/review-scope.mjs config` from the project
root (or the path to the plugin's copy).
