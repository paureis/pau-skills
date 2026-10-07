# Taxonomy of intermittent test failures

Each category has the symptoms that point to it, an experiment that confirms it (ideally by making the failure
deterministic), the right fix, and the wrong fixes that are tempting because they make the run go green.

Three wrong fixes apply to every category and are not repeated below: **retrying** the test, **raising a timeout or
adding a sleep**, and **skipping or quarantining** it. They hide the signal and leave the cause, and they are only
acceptable as a labelled, temporary measure that the user has approved, with a ticket for the real fix.

Where to start, by the rung of the reproduction ladder that first failed:

| First fails at | Look first at |
|---|---|
| Isolated, single test | time, randomness, async waits, concurrency inside the test, network, floating point, unordered collections |
| With its file | order dependence, shared fixtures, globals and env vars set by a neighbour |
| Whole suite | pollution from other files, resource exhaustion, shared databases or directories |
| Random order | order dependence (replay the seed) |
| Parallel | shared ports, files, databases, global state across workers, real races |
| Only in CI | environment differences, slower machines exposing races and waits, network |

---

## 1. Order dependence and shared state leakage

**Symptoms.** Passes alone, fails with its file or suite, or only with certain shuffle seeds. Failure mentions
unexpected existing data ("duplicate key", "expected 0 rows, got 1"), a cached value, a singleton already configured,
or a mock still active.

**How to confirm.** Replay the failing seed and get a consistent failure. Then find the minimal pair: run the
suspected polluter immediately before the victim (`rspec --bisect`, `detect-test-pollution` for pytest, or bisect the
test list by hand). "A then B fails 20/20, B alone passes 20/20" is a confirmed cause. Also check the reverse: a test
that only passes when another runs first depends on setup it does not do itself.

**Right fix.** Make each test own its state: create what it needs and clean it up in teardown that runs on failure
too (fixtures with scope `function`, `afterEach`, transactions rolled back per test, a fresh temporary directory, a
reset of singletons and caches). Fix the polluter, not only the victim. If the victim relied on the polluter's setup,
give it its own.

**Wrong fix.** Pinning test order, renaming tests so they sort differently, or moving the victim to its own CI job.

## 2. Time, timezones and date boundaries

**Symptoms.** Fails at particular times: near midnight, month end, February 29, daylight saving changes, New Year,
or only on runners in another timezone. Messages with off-by-one days or hours, "expected Tuesday, got Monday",
or a token or cache that "expired" during the test. Tests that compare `now()` taken at two different moments.

**How to confirm.** Freeze or set the clock to the boundary (`TZ=Pacific/Kiritimati`, `faketime '2026-03-31 23:59:59'`,
the language's fake clock: Jest/Vitest fake timers with a set system time, `freezegun` or `time-machine` in Python,
a `Clock` injected in Java, a clock interface in Go). If it fails every time at the boundary and passes elsewhere,
it is confirmed.

**Right fix.** Inject the clock and fix its value in the test. Compute expected values from the same frozen instant.
Store and compare times in UTC; convert at the edges. For durations, measure with a monotonic clock. Add a test that
pins the boundary that failed.

**Wrong fix.** Adding a tolerance of "plus or minus a day", or avoiding running the suite at midnight.

## 3. Randomness without a seed

**Symptoms.** Different failing input each time; property-based or fuzz tests failing once and not again; generated
names, IDs or data colliding occasionally ("unique constraint" on generated emails); shuffle-based logic.

**How to confirm.** Find every source of randomness in the test and the code (random libraries, UUIDs, faker
libraries, hash seeds such as `PYTHONHASHSEED`). Log the seed of each run. Re-run with the seed of a failing run and get
the same failure every time.

**Right fix.** Seed the generator per test and print the seed on failure, so any failure can be replayed. For
property-based tools, record the failing example (Hypothesis keeps a database, fast-check and proptest print a seed
and a shrunk case) and add it as an explicit regression case. For generated data, make uniqueness guaranteed (a
counter or sequence), not probable. If the random input exposed a real bug, fix the bug.

**Wrong fix.** Fixing one seed that happens to pass and never varying it again, or narrowing the generator's range
until the failing values cannot come up.

## 4. Concurrency and races

**Symptoms.** Fails more under parallel runs, under load, on fewer or more CPUs, or in CI; results that are
sometimes partial, duplicated or in the wrong order; deadlocks that end in a timeout; "concurrent modification"
errors; counts that are slightly off.

**How to confirm.** Run the race detector or sanitizer where one exists (`go test -race`, ThreadSanitizer for C, C++
and Rust via `-Z sanitizer=thread`, Java's `jcstress` for low-level cases). Vary parallelism and CPU count and see the
rate move. Inject a delay at the suspected interleaving point (a sleep in the code under test, temporarily, as an
experiment) and watch the failure become deterministic. Take thread or goroutine dumps on hangs.

**Right fix.** Fix the synchronization: a lock, an atomic, a channel, a single owner of the shared state, or removing
the sharing. In the test, wait for the specific event that signals completion (a latch, a future, a done channel)
rather than for time to pass. If two tests share a resource, give each its own.

**Wrong fix.** Running the suite single-threaded, adding a sleep before the assertion, or marking tests to never run
in parallel without understanding what they share.

## 5. Async waits and arbitrary sleeps

**Symptoms.** The test sleeps a fixed time and then asserts; UI or end-to-end tests that fail with "element not found"
or "detached from DOM"; assertions that run before a promise, callback, event or background job finishes; failure
rate rising on slower machines; an unawaited promise or a missing `await`, or an assertion inside a callback that may
never run.

**How to confirm.** Make the system slower at the suspected point (CPU throttling, a temporary artificial delay in the
awaited operation, network throttling in a browser). If the failure becomes frequent or certain, the test is racing
the operation. Linters help: `no-floating-promises` (typescript-eslint), `pytest-asyncio` warnings about unawaited
coroutines, Jest's "did not exit" and `--detectOpenHandles`.

**Right fix.** Wait for the condition, not for time: await the promise, poll for the state with a bounded wait that
reports the last observed value, use the framework's waiting assertions (Playwright's web-first assertions, Testing
Library's `findBy` and `waitFor`, Awaitility in Java, `Eventually` helpers). Expose a completion signal from background
work so the test can wait on it. Use fake timers where the waiting is for a timer.

**Wrong fix.** Lengthening the sleep, raising the global timeout, or adding a retry around the assertion.

## 6. Network and external services

**Symptoms.** Connection refused, reset or timed out; DNS errors; HTTP 429, 502, 503; failures clustered at certain
hours; tests that pass offline only when the service is mocked; a real third-party sandbox in the test path.

**How to confirm.** Run with the network blocked (no route, `unshare -n` on Linux, a firewall rule, or the language's
"no network" plugin such as `pytest-socket`) and see which tests now fail consistently: those are the tests that
reach out. Check the failing runs' timestamps against the provider's status page or rate limits.

**Right fix.** Unit and integration tests should not depend on a third party's uptime. Replace the call with a fake,
a local stub server or a recorded contract, and test the contract separately. For services you own, run them locally
in the test (containers, an in-memory implementation) with readiness checks. Keep a small, clearly separate suite of
live checks that is allowed to fail for external reasons and does not block merges.

**Wrong fix.** Retrying the HTTP call in the test, or raising client timeouts until the slow responses pass.

## 7. Resource exhaustion, ports and files

**Symptoms.** "Address already in use", "too many open files", out-of-memory kills, disk full, "database is locked",
file-not-found or permission errors on temporary paths; failures appearing late in the suite or only in parallel;
leaked processes, connections or containers between runs.

**How to confirm.** Watch resources during a suite run (open file descriptors with `lsof -p`, `ss -ltnp` for ports,
memory, disk). Run the suite with fewer files and see the failure go away; run it with the suspected leaking test
repeated many times and see it come sooner. Check for fixed port numbers and fixed file paths in tests.

**Right fix.** Close what you open (context managers, `try/finally`, `defer`, `using`, `afterEach`). Bind to port 0
and read the assigned port. Use a unique temporary directory per test and per worker. Give each parallel worker its
own database or schema. Shut down servers and child processes in teardown.

**Wrong fix.** Raising `ulimit`, adding a sleep to "let the port free up", or running on a bigger CI machine.

## 8. Pollution of globals and environment variables

**Symptoms.** A test that changes `process.env`, `os.environ`, system properties, the current working directory, the
locale, the default timezone, global configuration, logging levels, monkeypatched modules or class-level mocks, and
does not restore them. The victim fails depending on what ran before it, often in the same process only.

**How to confirm.** Snapshot the global state before and after each test (a small fixture that diffs the environment,
cwd, and relevant singletons) and report the test that changed it. Run the victim in its own process (nextest, `-p
no:xdist` versus forked, `--runInBand` versus workers) and see whether the failure follows the process boundary.

**Right fix.** Use the framework's scoped patching that restores automatically (`monkeypatch` in pytest,
`vi.stubEnv` with `unstubAllEnvs`, `t.Setenv` and `t.Chdir` in Go, JUnit extensions for system properties). Avoid
mutating globals in the code under test; pass configuration in.

**Wrong fix.** Setting the variable again at the top of the victim test, which hides the polluter and leaves the next
victim to find.

## 9. Floating point

**Symptoms.** Equality failures with values like `0.30000000000000004`; results that differ by CPU, compiler flags,
library version, or the order of a parallel reduction; sums of the same numbers in a different order giving a
different last digit.

**How to confirm.** Print the values with full precision. Run the computation with a fixed order and see the variation
disappear; vary the order (or the number of threads in a parallel sum) and see it return.

**Right fix.** Compare with a tolerance that matches the computation's actual error (`pytest.approx`, `toBeCloseTo`,
`assertEquals(expected, actual, delta)`), chosen and explained, not picked to make the test pass. For money and other
exact quantities, use integers or decimal types. Make reductions deterministic where reproducibility matters.

**Wrong fix.** Widening the tolerance until every observed value fits, or rounding both sides to fewer digits without
knowing why they differ.

## 10. Dictionary, set and unordered-collection ordering

**Symptoms.** Comparisons of lists built from maps, sets, hash-based collections, directory listings, database
queries without `ORDER BY`, or concurrent results; the same elements in a different order; differences between
language versions, platforms or hash seeds (Go randomizes map iteration on purpose; Python string hashing changes per
process unless `PYTHONHASHSEED` is set).

**How to confirm.** Sort both sides and compare: if the test now always passes, ordering is the cause. Vary the hash
seed or run on another platform to make it fail more often.

**Right fix.** Assert on what the contract promises: compare as sets or multisets, sort before comparing, or add an
explicit order to the query or API if callers depend on order (in which case the product had a bug).

**Wrong fix.** Hard-coding the order observed on one machine, or setting a fixed hash seed for the test run so the
order happens to be stable.

## 11. Environment differences (CI versus local, OS, locale)

**Symptoms.** Passes locally, fails in CI, or fails on one OS image only. Path separators, case-sensitive filesystems,
line endings (CRLF), locale-dependent formatting and sorting, default encodings, missing fonts or system tools,
different language or dependency versions, a different number of CPUs, running as root, a read-only home directory.

**How to confirm.** Diff the environments: runtime and dependency versions (from the lockfile and from `--version` in
the CI log), OS, locale, timezone, CPU count, environment variables. Reproduce in the CI image locally (the same
container image) or change one variable locally to the CI value at a time until it fails.

**Right fix.** Make the test independent of the difference (build paths with the path library, open files with an
explicit encoding, normalize line endings, set the locale the test means to test) or make the environments the same
(pin versions through the lockfile and the CI image). If the product behaves differently on the other platform, that
is a product bug.

**Wrong fix.** Skipping the test on the failing OS without a reason recorded, or only running it locally.

## 12. Real product bugs that only show under timing

**Symptoms.** Any of the above, but the root cause is in application code: a race between two requests, a missing
transaction or lock, a cache invalidated in the wrong order, a missing `await` in production code, a retry loop that
double-applies, a non-idempotent handler. Often looks like category 4 or 5 from the outside. Sometimes customers
report the same symptom rarely.

**How to confirm.** The forced reproduction (a delay injected in application code, two concurrent calls, the bad
interleaving) fails without involving the test's own setup. Ask whether a user doing the same thing at the same
speed would hit it. Search the issue tracker and error monitoring for the same message.

**Right fix.** Fix the product and keep the test as the regression check, now with the forcing condition made
deterministic. Tell the user plainly that the test was right and what users could have seen.

**Wrong fix.** Changing the test so it no longer exercises the timing, which deletes the only alarm for a real bug.
This is the most expensive wrong fix in the list, which is why every flake is assumed to be a possible product bug
until shown otherwise.
