# verification

Skills: `tdd`, `mutation-test` (with `scripts/mutate.sh`), `evaluator`, `flaky-test-hunt` (with `repeat.mjs`),
`migration-review`, `ci-cost-and-cadence` (with `measure-minutes.mjs`). Hooks: `test-tamper-guard` and
`verify-before-done`.

Both hooks are on when the plugin is installed. To turn one off or change how it behaves (for example, make
`test-tamper-guard` refuse instead of ask, or tell `verify-before-done` about your project's own check script), see
[docs/HOOKS.md](../../docs/HOOKS.md).
