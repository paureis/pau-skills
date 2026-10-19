# Area: testing

Load for every app. Run the project's own suite once after the profile is confirmed, and use its result as a
`command` row citing the test files and their lockfile or manifest (expiry 30 days). Detect the runner from the
project: `package.json` scripts (`node --test`, Jest, Vitest, Mocha, Playwright), `pytest` or `unittest`
(`python3 -m unittest discover`), `go test ./...`, `cargo test`, `mvn test` or `gradle test`, `bundle exec rspec`,
`dotnet test`, `mix test`, `phpunit`.

**TST-01 A test suite that runs and passes** (1, must-fix). Applies: any project. Check: run it. Pass: the command,
its pass count and the run time. A suite that needs manual setup to run says so in the README.

**TST-02 Tests on the paths that lose money or data** (2, must-fix). Applies: any app with sign-in, payments or
stored data. Check: tests for sign-in, permission checks (ACC-01 probes count), payment and webhook handling,
deletes and the main write path. Pass: `file:line` of each test. A coverage number alone does not pass this.

**TST-03 Tests of permission checks** (1, must-fix). Applies: accounts. Check: at least one test per route family
in which one user asks for another user's data and is refused. The probes from step 5, once added, are these tests.

**TST-04 End-to-end test of the main flow** (2, can-wait). Applies: an app with a UI. Check: one browser test
(Playwright, Cypress, a mobile runner) that signs up or in and completes the main task, run in CI.

**TST-05 Tests run in CI against a real database engine** (2, can-wait). Applies: an app with a database. Check:
the CI service container or a test database of the same engine and major version, not a different engine (SQLite
in tests, Postgres in production hides bugs).

**TST-06 Tests can fail** (2, can-wait). Applies: any suite. Check: break one guarded line (a permission check, a
total) and see a test fail; restore it. Report which ones you tried.

**TST-07 Error and edge input tests** (1, can-wait). Applies: any code that parses input or files. Check: tests for
an empty input, a missing file, a bad argument and an oversize input, with the expected exit code or status.
