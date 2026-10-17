# Evidence: reproducing, observing, bisecting, committing the repro

Reference for the `bug-fix` skill. Read the section the current step points to.

## Reproducing on the real surface

Drive the same surface the user used, with the same kind of input. A repro one layer below (a unit test instead of the
page) is fine as the automated check, but it is not the baseline and it is not the final proof.

| Surface | Drive it with | Read the observation from | Reset between runs |
|---|---|---|---|
| Web page | browser automation (Playwright, Puppeteer, Selenium, Cypress) or a browser tool in this session if one is available; `curl` for the HTTP request under the page | the DOM, the network response, the browser console | new browser context, cleared storage and cookies, reloaded server |
| CLI | the exact command, arguments, working directory, environment variables and stdin from the report | stdout, stderr, the exit code (`echo $?`, `$LASTEXITCODE` in PowerShell), files written | delete output files, caches and config written by the last run |
| Service or API | the service started the way it runs in production (same entry point, config, `docker compose up`), then `curl`, `grpcurl` or a small client | the response body and status, the service log, the database row | restart the process, reseed or roll back the test data |
| Library | a small program in the library's language that imports the built package (not its internals) and calls the public function with the reported input | the return value or the raised error, printed | a fresh process each run |
| Mobile app | iOS simulator (`xcrun simctl`), Android emulator or device (`adb`), UI drivers such as XCUITest, Espresso, Maestro or Detox | the screen, `adb logcat`, the simulator log, the network response | uninstall and reinstall, or clear the app data |
| Desktop app | the built app, UI automation where it exists, or scripted input | the window, the app log | quit the app, clear its settings and cache folders |
| Job, script or pipeline | the job on a copy of the input that triggered it | the output data, the job log | restore the input copy, clear partial output |

Two runs from a clean state, not one: a single run cannot tell a bug from leftover state or a one-off condition. If
the second run behaves differently from the first with the same input, the bug is intermittent or depends on state;
find out which before going further.

### When it does not fire

- **Build the trigger.** Write the input the report implies (the long name, the empty list, the leap day, the
  non-ASCII path), create the data shape it needs, or force the timing (a delay at the suspected point).
- **Tighten the conditions.** Match the reported version, configuration, locale, timezone (`TZ`), OS, feature flags,
  user role and data volume one at a time.
- **Instrument until it fires.** Log the path the request takes and compare it with the path the report implies. The
  first place they differ is where to look.

## Getting runtime evidence

Tag every print or log line you add with one unique marker (for example `BUGFIX:`), print the value together with its
type or length, and delete every tagged line before committing (search for the marker). A breakpoint changes nothing
in the code and is often cheaper.

| Language | Print or log | Debugger | Tracing and other tools |
|---|---|---|---|
| Python | `print(..., file=sys.stderr)`, `logging` | `breakpoint()`, `python -m pdb` | `python -X faulthandler`, `py-spy dump`, `sys.settrace` |
| JavaScript, TypeScript (Node) | `console.error` | `node --inspect-brk`, a `debugger` statement | `NODE_DEBUG=<module>`, `--trace-warnings`, `--trace-uncaught` |
| JavaScript in a browser | `console.log` | DevTools breakpoints, `debugger` | DevTools network and performance panels |
| Go | `fmt.Fprintf(os.Stderr, ...)`, `log` | `dlv debug`, `dlv test` | `go test -race`, `GODEBUG`, `runtime/trace` |
| Rust | `eprintln!`, `dbg!` | `rust-gdb`, `rust-lldb` | `RUST_BACKTRACE=1`, `RUST_LOG` with `tracing` or `env_logger` |
| Java, Kotlin | `System.err.println`, the project logger | `jdb`, or an IDE attached with `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005` | `jstack`, Java Flight Recorder |
| C#, .NET | `Console.Error.WriteLine`, `ILogger` | the IDE debugger, `dotnet-dump analyze` | `dotnet-trace`, `dotnet-counters` |
| Ruby | `warn`, `p` | `binding.irb`, `rdbg` (the `debug` gem) | `TracePoint` |
| PHP | `error_log`, `var_dump` | Xdebug | Xdebug traces |
| C, C++ | `fprintf(stderr, ...)` | `gdb`, `lldb` | `-fsanitize=address,undefined`, `valgrind` |
| Swift | `print`, `os_log` | `lldb` | Instruments |
| Shell | `echo ... >&2` | | `bash -x script.sh`, `set -x` |

Across languages:
- **System calls and files:** `strace -f` and `ltrace` on Linux, `lsof` for open files and ports. On macOS,
  `dtruss` works only with System Integrity Protection disabled; use `fs_usage`, `lsof` or Instruments instead.
- **Network:** the service's request log, `tcpdump`, a proxy such as mitmproxy, the browser network panel.
- **Services:** correlation or request IDs in logs, distributed traces (OpenTelemetry), the database query log
  (PostgreSQL `log_statement = 'all'`, the MySQL general log).

## Finding when it started: `git bisect`

When an older version is known to work, let git find the commit that broke it. `git bisect` checks out old commits
and stops on a dirty tree, so first remove your instrumentation or commit it on a scratch branch. Put the repro
script outside the repository, so checking out old commits does not touch it.

```bash
git bisect start <bad-commit> <good-commit>
git bisect run /path/outside/repo/repro.sh   # exit 0 = good, 125 = cannot test this commit (skip), any other code from 1 to 127 = bad
git bisect log                                # keep this for the report
git bisect reset
```

The script must build what it needs at each commit and exit 125 when the build itself fails, or bisect will blame
an unrelated commit. An exit code of 128 or more (a crash or a kill signal, which a shell reports as 128 plus the
signal number) aborts the whole bisect, so have the script catch those and map them to 1 (bad) or 125 (skip).

The commit bisect names is where to start asking "why", not proof of the root cause.

## Checking the observation itself

When a check passes too easily, or a fix that cannot have worked seems to work, check each of these before
believing it:

- The code running is the code you changed: rebuilt, reinstalled, the process restarted, no stale bundle, binary,
  container image or compiled cache (`__pycache__`, `target/`, `dist/`, `.next/`, `bin/` and `obj/`).
- The request reached the code: no CDN, browser, HTTP or application cache answered it; the log line you expect from
  that code path is there.
- The test ran: it was collected and not skipped or filtered out, the runner did not exit early, and the count of
  tests run is what you expect.
- You are looking at the right place: the right environment, account, database, branch, device and log file.
- The assertion can fail: change the expected value or undo the fix and watch it go red.

## Committing a failing test before the fix

Commit the failing test alone, then the fix on top, so the history shows the bug before its fix. Most CI systems run
only on the latest commit of a branch, so a red commit in the middle of a branch usually breaks nothing. When the
project requires every commit to pass (a rule in its contributing guide, a bisectable history, a commit hook that
runs the tests), mark the test as expected to fail and remove the marker in the fix commit.

A marker accepts any failure, including one for the wrong reason: a typo that raises a name error looks the same as
the bug under most of them. So first run the test without the marker and read the failure output: it must show the
discriminating observation (the wrong value, the reported error), not a setup or import error. Then add the marker,
and pin the reason where the runner can. Use a marker that turns red when the test starts passing, so it cannot
outlive the fix:

| Runner | Expected-failure marker | Pinning the reason |
|---|---|---|
| pytest | `@pytest.mark.xfail(strict=True, raises=<ExpectedError>, reason="...")` | `raises=`: any other exception is reported as a normal failure |
| Rust (built-in harness) | `#[should_panic(expected = "...")]` | `expected` must be a substring of the panic message, for example the wrong value a failing `assert_eq!` prints |
| Jest (28.1 and later) | `test.failing("...", ...)` | none: read the failure output before adding the marker |
| Vitest | `test.fails("...", ...)` | none: read the failure output before adding the marker |
| RSpec | `pending "reason"` inside the example | none: read the failure output before adding the marker |

Go's `testing`, JUnit, xUnit and NUnit have no marker of this kind. Do not use a skip in its place: a skipped test
stays green after the fix and proves nothing. For those, commit the test red if the project allows it; if it does
not, say in the report that the test and the fix landed in one commit, and show the test failing with the fix undone.
