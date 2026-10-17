# Driving the app

How to pick the harness the generated skill uses. The project's own harness comes first; the fallbacks are for a
project that has none. Whatever you pick, prove it works on this machine in step 2 of create mode before you write a
step that depends on it.

## 1. Look for the project's own harness

An end-to-end setup the project already maintains knows the app's start-up, sign-in and seed data better than a new
script. Look for these signals:

| Surface | Signals in the repository |
|---|---|
| Web | `playwright.config.*`, `cypress.config.*` or `cypress/`, `wdio.conf.*`, `nightwatch.conf.*`, Selenium or WebDriver in the test dependencies, `pytest-playwright` with a `page` fixture, Capybara system specs (`spec/system/`), Laravel Dusk (`tests/Browser/`) |
| CLI and TUI | `*.bats`, Go `testscript` files (`testdata/*.txtar`), Rust `assert_cmd`, `trycmd` or `snapbox`, Python `pexpect` or `click.testing`, `expect` scripts (`*.exp`), golden output folders |
| HTTP and RPC | `*.hurl`, `.http` or `.rest` files, Postman, Bruno or Insomnia collections, k6 scripts, contract tests, an OpenAPI or protobuf file (a list of routes, not a harness) |
| Mobile | `.maestro/` flows, `.detoxrc*`, Appium config, an iOS `*UITests` target, Android `androidTest/`, Flutter `integration_test/` |
| Desktop | Playwright's Electron support, Tauri WebDriver, WinAppDriver, Spectron in old projects |
| Glue | `e2e`, `test:e2e`, `smoke` or `acceptance` targets in the manifest, `Makefile` or `justfile`; the CI job that runs them (it shows the real launch order, environment variables and services); compose files; seed scripts; dev containers |

When one exists:

- Run one existing end-to-end test first. If it fails on a clean checkout, that is step 2's problem, not a reason to
  switch harness.
- Drive new journeys with scratch tests in the harness's own style. If its runner only finds tests in its own folder,
  put the scratch test there with a name that marks it (`verify-scratch-*`) and delete it in Cleanup.
- Use the harness's own launch command and fixtures, and say in the generated skill which file they came from.

## 2. Fallbacks by surface

### Web

- **Playwright**, through the project's language when it has a binding (JavaScript, Python, Java, .NET), or a browser
  tool the session already has (a browser MCP server, a built-in browser tool). Give each run a fresh browser
  context or profile.
- **Handles:** `getByRole` with the accessible name, `getByLabel`, `getByTestId`. Never coordinates, `nth-child` or
  long CSS paths.
- **Evidence:** a screenshot with the app's identity visible, an accessibility snapshot (`locator.ariaSnapshot()`), a
  trace (`context.tracing`) for a failure, and the browser console log.
- Browser downloads can be blocked in a sandbox. If they are, say so in the generated skill and use a browser that is
  already installed.

### CLI

- Run the built binary directly. Build once in Launch; never rebuild inside a drive.
- Give each drive its own home and data: a temporary folder as `HOME` (and `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
  `APPDATA` on Windows), or the app's own variable or flag for its config and data paths.
- **Evidence:** the exact command, stdout, stderr and the exit code, each in its own file, for example
  `cmd >"$EV/out.txt" 2>"$EV/err.txt"; echo $? >"$EV/exit.txt"`. Prefer machine-readable output (`--json`) for
  checks, and keep the human-readable output as evidence of what a user sees.
- A file the command writes is a side effect: read it back.

### TUI

- **tmux**: one session per drive, named with the run ID.
  ```bash
  tmux new-session -d -s "verify-$RUN_ID" -x 120 -y 40 '<command>'
  tmux send-keys -t "verify-$RUN_ID" 'some text' Enter
  tmux capture-pane -t "verify-$RUN_ID" -p -J > "$EV/screen-1.txt"
  tmux kill-session -t "verify-$RUN_ID"
  ```
  Wait for a prompt string or a screen change with a bounded loop over `capture-pane`, not a fixed sleep.
- Without tmux: `script` to record a session, or a pseudo-terminal library in the project's language (`pexpect`,
  `node-pty`, `creack/pty`, `portable-pty`). On Windows, WSL with tmux, or a ConPTY library (`pywinpty`, `node-pty`).
- **Evidence:** the captured screens in order, the keys sent, and the exit code.

### HTTP services

- **curl**, keeping the request and the response:
  `curl -sS -o "$EV/body.json" -D "$EV/headers.txt" -w '%{http_code}\n' "$URL/route"`.
- Readiness without a fixed sleep: `curl -fsS --retry 30 --retry-connrefused --retry-delay 1 "$URL/<health>"`, as long
  as that endpoint only answers 200 when the service is usable.
- Other protocols: `grpcurl` for gRPC, `websocat` for WebSockets, the project's own client for queues.
- **Side effects:** read back through a second view: a GET after a POST, a query with read-only credentials, the file
  on disk.

### Mobile

- **iOS** (macOS with Xcode only): `xcrun simctl boot`, `install`, `launch`, `openurl` for deep links, and
  `xcrun simctl io <device> screenshot <file>`. Interactions through XCUITest or Maestro.
- **Android**: `emulator -avd <name> -no-window`, `adb install`, `adb shell am start`, `adb shell input`,
  `adb exec-out screencap -p > shot.png`, `adb shell uiautomator dump` for the view tree, `adb logcat` for logs.
- **Cross-platform apps**: Maestro or Detox for React Native, `flutter test integration_test` or `flutter drive` for
  Flutter.
- When no simulator can run on this machine (no Xcode, Linux without hardware virtualization), say so in the generated
  skill. Drive what can be driven, such as the API the app calls, and never report the mobile journey as verified.

### Desktop

- Electron: Playwright's `_electron.launch`, or start it with `--remote-debugging-port` and connect over the Chrome
  DevTools Protocol.
- Native apps: the platform's accessibility automation (macOS Accessibility or AppleScript, Windows UI Automation or
  WinAppDriver, AT-SPI or `xdotool` on Linux).

### Libraries

There is no app to start: the user is a caller. Drive it through a scratch program that uses the public API the way
a consumer does, against a clean install of the built package, not the source tree.

## 3. Long-running processes in Claude Code

- Start a server with the Bash tool's background option, or with `nohup <command> >"$RUN/app.log" 2>&1 &` followed by
  `echo $! >"$RUN/pids"`. A background shell ends with the session, so never rely on a server from an earlier
  session.
- Wait for readiness on a condition (a log line, a health check), in a loop with a time limit. Some environments
  refuse a bare `sleep`; `curl --retry` or a tool that waits on a condition works there.
- Record everything the run starts: process IDs, and the process group when the start command spawns children (a
  package-manager script often does), container IDs, tmux session names, temporary folders.
- Let the app pick its port (port 0) or choose a free one, and read the real port from its output. Never assume the
  default port is free, or that whatever answers on it is yours.
