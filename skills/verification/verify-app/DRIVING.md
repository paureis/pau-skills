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
  put the scratch test there with the run ID in its name (`verify-scratch-$RUN_ID-<feature>.spec.ts`), record its
  exact path in `$RUN/started.txt` (`path <path>`), and let Cleanup delete only the paths recorded there. Never
  delete scratch files by a glob: another session's run may have its own.
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
- **States:** force loading, empty and error from outside the app, with the harness's request interception
  (Playwright `page.route`, Cypress `cy.intercept`, WebdriverIO `browser.mock`), or the app's own delay or mock switch
  where the harness cannot intercept. The template's "States and skeletons" section has the calls for each harness
  and the recipe that measures a skeleton against the loaded screen.
- Browser downloads can be blocked in a sandbox. If they are, say so in the generated skill and use a browser that is
  already installed.

### CLI

- Run the built binary directly. Build once in Launch; never rebuild inside a drive.
- **Find every place it writes** before the first drive: the current folder (a `./todo.json`, a `./.cache`), `HOME`,
  the XDG folders (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`), `APPDATA` and `LOCALAPPDATA` on Windows, the
  temp folder, and any path set by a flag, a variable or a config file. Read the code that opens files, and run it
  once in a throwaway folder to see what appears. Point every one into `$RUN`: by the app's own variable or flag, by
  `env HOME="$RUN/home" ...` on the command, or, when it writes relative to the current folder, by running it from a
  folder of the run (`cd "$RUN/work" && ...` inside the step). Commands start from the repository root, so a file
  written "here" lands in the user's repository.
- **Evidence per step:** save the command to a file, run it from that file, and keep stdout, stderr and the exit code
  next to it, so the evidence is exactly what ran:
  ```bash
  F="$EV/<feature>"; mkdir -p "$F"; S="$F/01-<step>"
  cat > "$S.cmd" <<'CMD'
  cd "$RUN/work" && node "$REPO/todo.mjs" add buy milk
  CMD
  sh "$S.cmd" > "$S.out" 2> "$S.err"; echo $? > "$S.exit"; cat "$S.out" "$S.err"; echo "exit $(cat "$S.exit")"
  ```
  Number the steps of a feature `01-`, `02-` and so on, in the order they ran. Prefer machine-readable output
  (`--json`) for checks, and keep the human-readable output as evidence of what a user sees.
- A file the command writes is a side effect: read it back, and copy it into the step's evidence.
- After the drive, `git status --porcelain` must be what it was before the run. Anything new is a write that escaped
  the run folder.

### TUI

- **tmux**, on a private server for the run (`-L`), so it does not inherit the environment of a tmux server the user
  already has, and no name can match another run's session. Pass the app's environment on the command itself. With
  `remain-on-exit` the pane stays after the program ends, so the last screen and the exit code can still be read.
  ```bash
  [ -n "$RUN_ID" ] || { echo "RUN_ID is empty: start a run first" >&2; exit 2; }
  T="verify-$RUN_ID"
  printf 'set -g remain-on-exit on\n' > "$RUN/tmux.conf"
  tmux -L "$T" -f "$RUN/tmux.conf" new-session -d -s main -x 200 -y 50 \
    "env HOME='$RUN/home' XDG_CONFIG_HOME='$RUN/home/.config' <command>"
  echo "tmux $T" >> "$RUN/started.txt"
  tmux -L "$T" send-keys -t '=main:' 'some text' Enter
  tmux -L "$T" capture-pane -p -J -t '=main:' > "$S.screen.txt"
  tmux -L "$T" display-message -p -t '=main:' '#{pane_dead} #{pane_dead_status}'   # "1 <exit code>" once it ended
  tmux -L "$T" kill-server                                                          # in Cleanup: this run's server only
  ```
  Every tmux command names the socket (`-L "$T"`) and an exact target (`=main:`); never run one with an empty run ID.
  Wait for a prompt string or a screen change with a bounded loop over `capture-pane`, not a fixed sleep.
- Without tmux: `script` to record a session, or a pseudo-terminal library in the project's language (`pexpect`,
  `node-pty`, `creack/pty`, `portable-pty`). On Windows, WSL with tmux, or a ConPTY library (`pywinpty`, `node-pty`).
- **Evidence:** the captured screens in order (`01-<step>.screen.txt`, ...), the keys sent, and the exit code.

### HTTP services

- **curl**, keeping the request and the response, in the step files described under CLI:
  `curl -sS -o "$S.body" -D "$S.headers" -w '%{http_code}\n' "$URL/route"` inside `$S.cmd`. The printed code is the
  status; `-sS` alone does not show it.
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

## 3. Run state and processes in Claude Code

- **Each Bash tool call starts a fresh shell**: variables set in one call are gone in the next. The template writes the
  run's variables to `$RUN/env` as `NAME='value'` lines, and every later command loads it with
  `set -a; . "$RUN/env"; set +a`. `set -a` exports them, so programs started from that shell (the app, `node`, `sh`)
  see them too; without it they are shell variables only, and an app variable such as a data file path never reaches
  the app. Append anything learned later (the URL, a token, an app variable) to the same file.
- **One record of what the run started**: `$RUN/started.txt`, one line per thing, written right after it starts:
  `pid <pid> <start time>`, `tmux <socket name>`, `path <path>`, `container <id>`.
- **Start a server** with `nohup <command> > "$RUN/app.log" 2>&1 &` on a line of its own, then record it:
  ```bash
  echo "pid $! $(ps -o lstart= -p $! | tr -s ' ' | sed 's/^ //')" >> "$RUN/started.txt"
  ```
  `$!` is the process the `&` applied to: after `cd dir && <command> &` it is a subshell, not the app, and stopping it
  can leave the app running. A process started with `nohup` outlives the Bash call and can outlive the session; never
  rely on a server from an earlier session. When the start command spawns children (a package-manager script often
  does), record the child: from the app's own report of its process ID, a pid file it writes, or the port's owner.
- **The doctor checks the record against the app**: the process ID the app reports, or the owner of its port:
  `ss -ltnp 'sport = :<port>'` or `lsof -nP -iTCP:<port> -sTCP:LISTEN` on Linux, `lsof -nP -iTCP:<port> -sTCP:LISTEN`
  on macOS, `Get-NetTCPConnection -LocalPort <port> -State Listen` (its `OwningProcess`) or `netstat -ano` on Windows.
- **Stop only what the record lists, and only if it is still the same process.** A process ID can be reused once the
  process ends, so compare the start time before stopping it:
  ```bash
  [ -n "$RUN_ID" ] && [ -n "$RUN" ] || { echo "no run loaded: RUN_ID or RUN is empty" >&2; exit 2; }
  while read -r kind id rest; do
    case "$kind" in
      pid) now="$(ps -o lstart= -p "$id" 2>/dev/null | tr -s ' ' | sed 's/^ //')"
           if [ -n "$now" ] && [ "$now" = "$rest" ]; then kill "$id"; else echo "skip pid $id: ended or not this run's"; fi ;;
      tmux) tmux -L "$id" kill-server 2>/dev/null ;;
      path) p="$id${rest:+ $rest}"; case "$p" in "$RUN"/*|*"-$RUN_ID-"*) rm -rf -- "$p" ;; *) echo "skip $p: not this run's" ;; esac ;;
    esac
  done < "$RUN/started.txt"
  ```
  Then confirm before removing anything else, because `$RUN` holds the record:
  ```bash
  for i in $(seq 1 25); do
    alive=0
    while read -r kind id rest; do
      [ "$kind" = pid ] && [ "$(ps -o lstart= -p "$id" 2>/dev/null | tr -s ' ' | sed 's/^ //')" = "$rest" ] && alive=1
    done < "$RUN/started.txt"
    [ "$alive" = 0 ] && break; sleep 0.2
  done
  [ "$alive" = 0 ] && echo "stopped" || echo "STILL RUNNING: keep $RUN and find out why"
  git status --porcelain | diff "$RUN/git-status.before" - > /dev/null && echo "repository unchanged" || echo "REPOSITORY CHANGED"
  ls "$EV"
  ```
  Remove `$RUN` (`rm -rf -- "$RUN"`) only when it printed `stopped` and `repository unchanged`, and the evidence is
  listed. On Windows, compare `(Get-Process -Id <pid>).StartTime` instead of `ps -o lstart=`.
- **Wait for readiness on a condition** (a log line, a health check), in a loop with a time limit. Some environments
  refuse a bare `sleep`; a bounded loop, `curl --retry` or a tool that waits on a condition works there.
- **Ports**: let the app pick (port 0) or choose a free one, and read the real port from its output. Never assume the
  default port is free, or that whatever answers on it is yours.
