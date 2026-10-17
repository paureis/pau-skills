# verification

Skills: `tdd`, `mutation-test` (with `mutate.sh`), `evaluator`, `flaky-test-hunt` (with `repeat.mjs`),
`migration-review`, `ci-cost-and-cadence` (with `measure-minutes.mjs`), `review-triage` (with `TRIAGE.md` and
`review-scope.mjs`), `bug-fix` (with `EVIDENCE.md`), `verify-app` (with `check-map.mjs`, `DRIVING.md`, `MAINTAIN.md`
and templates), `hillclimb` (with `decisions.mjs` and `BENCHMARK-CHECKLIST.md`), `skill-eval` (with `skill-eval.mjs`
and `JUDGE-BRIEF.md`). Hooks: `test-tamper-guard` and `verify-before-done`.

Both hooks are on when the plugin is installed. To turn one off or change how it behaves (for example, make
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
