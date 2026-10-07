# Commands to isolate, repeat, shuffle and parallelize

Flags change between versions. Before relying on one, check it against the project's installed version (`--help`,
the lockfile, the runner's docs). Prefer the project's own wrapper (`npm test`, `make test`, `./gradlew test`) when it
sets environment or config the test needs, and pass the filter through it.

Wherever a runner has no repeat option, or its repeat option runs inside one process (which hides state that only
leaks between processes, or only appears within one), wrap the command with `repeat.mjs`:

```bash
R="${CLAUDE_PLUGIN_ROOT}/skills/flaky-test-hunt/repeat.mjs"
node "$R" --runs 100 --timeout 60 -- <single-test command>
node "$R" --runs 20 --parallel 4 -- <file command>        # copies of the same test at once: shared ports, files, DBs
node "$R" --runs 300 --until-fail -- <single-test command> # stop at the first failure and keep its output
```

In-process repetition and process-level repetition answer different questions. A test that fails only on the second
in-process repetition is leaking state into itself; a test that fails only across processes depends on something
outside the process (files, ports, the clock, the network). Try both when the first finds nothing.

Record the seed every time you shuffle. A shuffle without a seed is a failure you cannot replay.

## JavaScript and TypeScript

**Jest**
- One test: `npx jest path/to/file.test.ts -t "exact test name"` (`-t` is `--testNamePattern`, a regex).
- One process, no workers: `--runInBand` (`-i`). Compare with the default worker pool to see whether parallelism matters.
- Random order: `--randomize` with `--seed=<n>` (Jest 29.2 and later); `--showSeed` prints the seed used.
- Open handles keeping the process alive, a sign of leaked timers or sockets: `--detectOpenHandles`.
- Repeat: no CLI flag; use `repeat.mjs`. Do not leave `jest.retryTimes` in place as a fix.

**Vitest**
- One test: `npx vitest run path/to/file.test.ts -t "name"`.
- Shuffle: `--sequence.shuffle` and `--sequence.seed=<n>`.
- No file parallelism: `--no-file-parallelism`; isolation mode: `--pool=forks` versus `--pool=threads`.
- In-process repetition: the per-test `repeats` option (`test("x", { repeats: 50 }, fn)`) in versions that have it.
- `--retry` is a wrong fix here as everywhere.

**Mocha**: `--grep "name"`, `--parallel --jobs <n>`; no built-in shuffle, so vary file order by listing files.
**Playwright**: `--repeat-each=<n>`, `--retries=0`, `--workers=1` versus the CI worker count, `-g "title"`,
`--trace=retain-on-failure` to keep a trace of the failing run.
**Cypress**: no built-in repeat; loop `npx cypress run --spec <file>` with `repeat.mjs`.

## Python

**pytest**
- One test: `pytest "tests/test_x.py::TestCls::test_y[param]"`; by keyword: `-k "name"`. Stop at first failure: `-x`.
- In-process repetition (pytest-repeat): `--count=<n>` with `--repeat-scope=function|class|module|session`.
- Order: pytest-randomly shuffles by default when installed. Disable with `-p no:randomly`; replay with
  `-p randomly --randomly-seed=<n>` or `--randomly-seed=last`. Without the plugin, `pytest-random-order` uses
  `--random-order` and `--random-order-seed=<n>`.
- Parallel (pytest-xdist): `-n <k>` or `-n auto`; `--dist loadfile` keeps a file on one worker, which hides or reveals
  cross-file sharing.
- Find which earlier test pollutes the failing one: the `detect-test-pollution` tool
  (`detect-test-pollution --failing-test tests/test_x.py::test_y --tests tests/`) bisects the test list for you.
- `--reruns` (pytest-rerunfailures) and `@flaky` decorators are wrong fixes.

**unittest**: `python -m unittest tests.test_x.TestCls.test_y`; loop with `repeat.mjs`. For order effects run the
module, then the package, then discovery (`python -m unittest discover`).

## Go

- One test: `go test ./pkg/... -run '^TestName$'` (subtests: `-run '^TestName$/^sub$'`).
- Repeat in one process, bypassing the cache: `-count=<n>` (any `-count` disables test caching).
- Race detector: `-race`. Run it on every Go flake; it is the cheapest confirmation of a data race.
- Shuffle: `-shuffle=on` prints the seed it used; `-shuffle=<seed>` replays it (Go 1.17 and later).
- Parallelism: `-parallel <n>` for `t.Parallel()` tests, `-cpu 1,2,4` to vary GOMAXPROCS, `-p <n>` for packages at once.
- Stop early: `-failfast`. Hangs: `-timeout 60s` prints all goroutine stacks when it fires, which is the evidence.

## Rust

- One test: `cargo test name -- --exact`; show output: `-- --nocapture`.
- One thread: `cargo test -- --test-threads=1`; compare with the default to see if tests share state across threads.
- Shuffle (nightly libtest): `cargo +nightly test -- -Z unstable-options --shuffle --shuffle-seed <n>`.
- `cargo nextest run` runs each test in its own process; a test that fails under `cargo test` but passes under nextest
  shares process state (globals, env vars, the current directory) with another test.
- Repeat: loop with `repeat.mjs`. For suspected races in lock-free code, the `loom` crate explores interleavings.

## Java and Kotlin

**Gradle**
- One test: `./gradlew test --tests 'com.example.FooTest.barMethod'`.
- Force a re-run without the up-to-date check: `--rerun` (Gradle 7.6 and later) or `cleanTest test`.
- Process isolation: `forkEvery = 1` and `maxParallelForks` in the test task.

**Maven Surefire**
- One test: `mvn -Dtest='FooTest#barMethod' test` (add `-Dsurefire.failIfNoSpecifiedTests=false` in multi-module builds).
- Order: `-Dsurefire.runOrder=random`, replay with `-Dsurefire.runOrder.random.seed=<n>` (recent Surefire versions);
  `alphabetical` and `reversealphabetical` are cheap order checks.
- Isolation: `-DforkCount=1 -DreuseForks=false`; parallel: `-Dparallel=methods -DthreadCount=4`.
- `-Dsurefire.rerunFailingTestsCount` is a wrong fix.

**JUnit 5** (in `junit-platform.properties` or as system properties)
- In-process repetition: `@RepeatedTest(100)` on a temporary copy of the test.
- Random method order: `junit.jupiter.testmethod.order.default=org.junit.jupiter.api.MethodOrderer$Random`; class order:
  `junit.jupiter.testclass.order.default=org.junit.jupiter.api.ClassOrderer$Random`; seed:
  `junit.jupiter.execution.order.random.seed=<n>`.
- Parallel: `junit.jupiter.execution.parallel.enabled=true` with `junit.jupiter.execution.parallel.mode.default=concurrent`.

## Ruby

**RSpec**: one example `rspec spec/x_spec.rb:42`; random order `--order rand` (prints the seed); replay `--seed <n>`;
find the minimal polluting set `rspec --seed <n> --bisect`. Parallel: the `parallel_tests` gem (`parallel_rspec`).
**Minitest**: `ruby -Itest test/x_test.rb -n "/name/"`, replay order with `--seed <n>`.

## PHP

**PHPUnit**: one test `--filter 'testName'` (or `'FooTest::testName'`); random order `--order-by=random` with
`--random-order-seed=<n>`; `--order-by=defects` runs previously failing tests first. `--repeat <n>` exists in some
major versions and not others; check `phpunit --help` and otherwise loop with `repeat.mjs`.
Parallel: ParaTest (`vendor/bin/paratest -p 4`). **Pest**: `--filter`, `--parallel`, `--order-by=random` where supported.

## .NET

- One test: `dotnet test --filter "FullyQualifiedName~Namespace.Class.Method"` (also `Name=`, `TestCategory=`).
- Repeat: loop with `repeat.mjs` (add `--no-build` after the first build to save time). NUnit has `[Repeat(n)]` for an
  in-process variant; `[Retry]` is a wrong fix.
- Parallelism: xUnit runs test collections in parallel by default; turn it off with `"parallelizeTestCollections":
  false` in `xunit.runner.json` to see whether the failure depends on it. NUnit: `[Parallelizable]` and
  `LevelOfParallelism`.
- Hangs: `--blame-hang-timeout 2m` collects a dump of the hung run; `--blame` names the test that crashed the host.

## Others

- **Elixir**: `mix test test/x_test.exs:42`, `--seed <n>` (use `--seed 0` for definition order),
  `--repeat-until-failure <n>` (Elixir 1.17 and later). `async: true` modules run concurrently.
- **Swift / Xcode**: `swift test --filter Suite/testName`; `xcodebuild test -only-testing:<target>/<class>/<method>
  -test-iterations 100 -run-tests-until-failure` (Xcode 13 and later); test plans have a randomize-order option.
- **Bazel**: `bazel test //pkg:target --runs_per_test=100 --test_output=errors`; `--flaky_test_attempts` and
  `flaky = True` are wrong fixes.
- **Anything else**: find the single-test filter in the runner's help, then loop it with `repeat.mjs`.

## Making the local run look like CI

- Same command, flags and worker count as the workflow file, and `CI=true` (some tools change behaviour on it).
- `TZ=UTC` and also a far timezone (`TZ=Pacific/Kiritimati`, `TZ=America/St_Johns`); `LANG=C.UTF-8` and a non-English
  locale such as `LANG=de_DE.UTF-8` (decimal commas, sorting).
- Fewer and slower CPUs: `taskset -c 0 <cmd>` (Linux), `docker run --cpus=1 --memory=1g`, or load from `stress-ng`.
- A clean state: fresh clone, empty caches and temp directories, no local services already running on the test ports.
- The same OS and filesystem where possible: case sensitivity, path separators and line endings differ between them.
