---
name: verify-<app>
description: "TODO(verify-app) check the wording: Launch <app>, drive its <surface> the way a user does, and keep evidence. Use when asked to verify, reproduce or show proof of a change in <app>, or before calling a change to <app> done."
---

# Verify <app>

TODO(verify-app): one paragraph on what the app is, which surface this skill drives, and the surfaces it does not cover yet.

Read this whole file before the first command. Then read `features/README.md` and the feature file for what you are
verifying. Every command runs from the repository root.

## Run folders

Every run has an ID, a scratch folder `$RUN` (deleted in Cleanup) and an evidence folder `$EV` (kept). Each Bash call
starts a fresh shell, so the first command of a run saves the variables to `$RUN/env` and prints the ID:

```bash
RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
RUN="${TMPDIR:-/tmp}/verify-<app>-$RUN_ID"
EV="$PWD/.verify-evidence/$RUN_ID"
mkdir -p "$RUN/home" "$RUN/work" "$EV"
: > "$RUN/started.txt"
git status --porcelain > "$RUN/git-status.before"
printf "RUN_ID='%s'\nRUN='%s'\nEV='%s'\nREPO='%s'\n" "$RUN_ID" "$RUN" "$EV" "$PWD" > "$RUN/env"
echo "RUN_ID=$RUN_ID"
```

Every later command starts with these lines, with the printed ID. They refuse to go on without a run, and `set -a`
exports the variables so that the app and every program it starts see them:

```bash
RUN_ID='<the printed ID>'
[ -n "$RUN_ID" ] && [ -f "${TMPDIR:-/tmp}/verify-<app>-$RUN_ID/env" ] || { echo "no such run: start one first" >&2; exit 2; }
set -a; . "${TMPDIR:-/tmp}/verify-<app>-$RUN_ID/env"; set +a
```

Anything learned later (the URL, a token, an app variable) is appended to `$RUN/env` as a `NAME='value'` line.
`$RUN/started.txt` records everything the run starts, one line each: `pid <pid> <start time>`, `tmux <socket>`,
`path <path>`, `container <id>`. Cleanup stops and removes only what it lists.

Where the app writes: TODO(verify-app) every place the app writes (the current folder, HOME, XDG folders, the temp folder, a configured path) and how each is pointed into `$RUN`, appended to `$RUN/env` where it is a variable.

Isolation: TODO(verify-app) whether two instances can run side by side (ports, data folders, profiles); if not, never drive an instance this run did not start.

## Launch

TODO(verify-app) keep the variant below that fits this app, delete the other, and fill it in.

For a server or a UI: build once, start the app in the background on a line of its own, and record it in
`$RUN/started.txt` right away: `echo "pid $! $(ps -o lstart= -p $! | tr -s ' ' | sed 's/^ //')" >> "$RUN/started.txt"`.
Start from an empty data folder in `$RUN`, including migrations and seed data.

```bash
TODO(verify-app) the preamble, then the build, the background start with its log in $RUN/app.log, and the record line
```

Ready when: TODO(verify-app) the condition that proves a user could act now (a log line, a health check that covers the data store); an open port is not enough.

```bash
TODO(verify-app) the preamble, then a bounded wait for that condition, and the line that appends the URL or port to $RUN/env
```

For a CLI, a TUI or a library: nothing stays running. Launch builds or installs once; each drive then runs in its own
isolated session (the folders in "Where the app writes", its own terminal session for a TUI).

```bash
TODO(verify-app) the preamble, then the build or install, and the path of what it built
```

## Doctor

Run before the first drive, after any failed drive, and after anything surprising. It changes nothing.

- For a server or a UI: the process is up and is the one this run started (the process ID the app reports, or the
  port's owner, matches `$RUN/started.txt`), it runs the build under test (version or commit), its data folder is in
  `$RUN`, and sign-in is valid.
- For a CLI, a TUI or a library: the program the drive will run is the one built from this working tree (its path,
  and its version or commit), not another copy on `PATH`, and the variables in "Where the app writes" point into
  `$RUN`.

```bash
TODO(verify-app) the preamble, then the read-only check
```

Healthy means: TODO(verify-app) the exact output to expect. Anything else: do not drive; fix or relaunch. When the doctor passes but the app looks wrong (a stuck screen), reset to a known state or relaunch.

## Drive

Harness: TODO(verify-app) the harness, and the file in this repository it comes from.

TODO(verify-app) how to send one action and read one result with that harness, with real handles from this repository (roles and accessible names, labels, test IDs, prompt strings, routes, command names) and the source file of each.

Wait on conditions, never on fixed sleeps. The recipes per feature are in `features/`. A step that fails may already
have changed the app's data: run Cleanup and Launch again before retrying it.

## Evidence

Evidence folder: `.verify-evidence/<run-id>/`

The folder is ignored by git and Cleanup never touches it. Each feature has a subfolder, `$EV/<feature>/`, created
before its first step, and each step's files are numbered in the order they ran: `01-<step>.cmd` (exactly what ran),
`01-<step>.out`, `01-<step>.err`, `01-<step>.exit`, plus whatever the surface needs (`.png`, `.aria.txt`, `.body`,
`.headers`, `.screen.txt`). A command step:

```bash
F="$EV/<feature>"; mkdir -p "$F"; S="$F/01-<step>"
cat > "$S.cmd" <<'CMD'
the command, exactly as it should run
CMD
sh "$S.cmd" > "$S.out" 2> "$S.err"; echo $? > "$S.exit"; cat "$S.out" "$S.err"; echo "exit $(cat "$S.exit")"
```

TODO(verify-app) what else to capture for this surface (screenshots, accessibility snapshots, logs, files the app wrote) and when; for a server, the app log is copied into `$EV` before Cleanup.

Proof rules:

- Use the real user path, never an internal setter, a test-only endpoint or a seeded shortcut.
- Capture the action and the state it produced, not only the final screen.
- Check side effects (files written, rows stored, messages sent) through a second, read-only view.
- Mock only where a production boundary already isolates the external system.
- Trust a dry run or test mode only after observing what it skips.
- Record the feature file and the entry point with every artifact. A path you could not reach is reported with the
  command tried and the missing precondition, never as verified through another path.
- Redact tokens and secrets from captured requests and logs.
- In a temporary git worktree, the evidence goes when the worktree goes: copy it out first.

## States and skeletons

TODO(verify-app) keep this section for an app with a screen and fill it in. For an app with no screen (a CLI, a TUI, an HTTP API, a library), replace everything under this heading with "No screen: each feature file says so under States." and do not copy `measure-boxes.js`.

Every feature file has a `States` section: how to force the screen's loading, empty and error states, what each
should look like, and the screenshot to keep. Force each state from outside the app, and open the screen by its URL,
not by a click: the browser ignores layout shifts within 500 ms of input, so a click hides them.

Holding or answering the data request: TODO(verify-app) the harness's request interception (the calls are below), or, where the harness cannot intercept, the app's own delay or mock switch and the file it comes from.

Viewports: TODO(verify-app) the viewports in the project's end-to-end config, with the file (for example `projects` in `playwright.config.ts`, `viewportWidth` in `cypress.config.js`); without one, 390 by 844 (a phone) and 1280 by 800 (a desktop).

Skeleton markers: TODO(verify-app) how a skeleton box is paired with its real box: the project's own marker, with the file; without one, `data-skeleton-for="<name>"` on each skeleton box and `data-skeleton-name="<name>"` on the real element it stands for; where neither exists, the container whose children are paired in document order.

### Measure a skeleton against the loaded screen

The in-page part is `measure-boxes.js` in this skill's folder: browser JavaScript, the same text in every harness. It
pairs each skeleton box with its real box by name (the nth `row` with the nth `row`), or, with `container`, by
document order inside that container. At each viewport, in a fresh page:

1. Add `measure-boxes.js` to the page: as an init script, or by evaluating its text right after the page opens.
2. Hold the data request, open the screen by URL, and wait until the skeleton shows.
3. Evaluate `window.__verifyBoxes.skeleton(options)`, then take the loading screenshot.
4. Release the request, answered with as many items as the skeleton has rows (the harness lines below show how),
   and wait until the real content shows. A skeleton has a fixed number of rows, so a list of another length can
   never pair box for box.
5. Evaluate `window.__verifyBoxes.compare(options)`. It resolves to a report. Save its `text` as
   `$EV/<feature>/NN-skeleton-<viewport>.txt` and the whole report as `.json` next to it, then take the loaded
   screenshot.

`options` is `{}` for the default markers. Other markers: `{ skeleton: '<selector>', skeletonName: '<attribute>',
real: '<selector>', realName: '<attribute>' }`. Order inside a container: `{ container: '<selector>' }`. The limits
stay at their defaults, `tolerance: 4` and `maxShift: 0.1`.

Reading the report:

- A pair is a mismatch when the real box is more than 4 px away from the skeleton box in x, y, width or height. The
  line gives both boxes and each difference, for example `off by y +40 px, height +20 px`.
- A box with no partner is `UNPAIRED`: a skeleton box with nothing real behind it, or real content the skeleton
  left out.
- A `COUNT` line means a name has a different number of skeleton and real boxes, for example 3 skeleton rows over 5
  people. That is not a size mismatch, and resizing does not fix it: answer the held request with as many items as
  the skeleton has rows and measure again. The `UNPAIRED` lines from the extra rows go away with it.
- A `FAILED` line means the check did not run, and the report fails whatever else it says. `no boxes matched: check
  the markers or the selector` means nothing on the page carried the markers, or a selector or container in
  `options` is wrong: fix the options, not the app. `skeleton() was not called` means `compare()` ran without a
  skeleton recorded first: run step 3 while the screen is still loading.
- The layout-shift score is the sum of the page's `layout-shift` entries without recent input. Above 0.1 (the
  browser's "good" line) is a mismatch. Only Chromium has these entries: on another engine the helper finds no
  `layout-shift` in `PerformanceObserver.supportedEntryTypes`, skips the score and says so, and the box check stands
  alone.
- Expect the boxes, not the score, to find most gaps. Only elements that were already on screen and moved count
  toward the score, so a skeleton replaced by taller rows adds little: on one measured page, three rows each 20 px
  short scored 0.0418 on a phone and 0.017 on a desktop, under the 0.1 line, while every row's box was off. Zero
  entries means nothing moved: a score of 0, a pass.

### The calls in each harness

Replace `**/api/items*` with the screen's data request, `$SKILL` with this skill's folder,
`.claude/skills/verify-<app>`, and `n` with the number of skeleton rows. Where the list sits inside the body (for
example `{ "items": [...] }`), cut that list instead of the whole body.

- **Playwright, JavaScript or TypeScript.** Viewport: `browser.newContext({ viewport: { width: 390, height: 844 } })`.
  Helper: `await context.addInitScript({ path: '$SKILL/measure-boxes.js' })`. Hold:
  `const held = []; await page.route('**/api/items*', (route) => { held.push(route); })`. Release:
  `for (const r of held) await r.continue();` and only then `await page.unroute('**/api/items*')`. Release with `n`
  items: `const res = await r.fetch(); await r.fulfill({ response: res, json: (await res.json()).slice(0, n) })` in
  place of `r.continue()`. Empty:
  `route.fulfill({ json: [] })`. Error: `route.fulfill({ status: 500 })`. Measure:
  `await page.evaluate(() => window.__verifyBoxes.compare())`.
- **Playwright, Python.** `browser.new_context(viewport={"width": 390, "height": 844})`,
  `context.add_init_script(path="$SKILL/measure-boxes.js")`, `page.route("**/api/items*", lambda route: held.append(route))`,
  `route.continue_()`, with `n` items `res = route.fetch(); route.fulfill(response=res, json=res.json()[:n])`,
  `route.fulfill(json=[])`, `route.fulfill(status=500)`,
  `page.evaluate("window.__verifyBoxes.compare()")` (Playwright waits for the Promise).
- **Playwright, Java.** `new Browser.NewContextOptions().setViewportSize(390, 844)`,
  `context.addInitScript(Paths.get("$SKILL/measure-boxes.js"))`, `page.route("**/api/items*", route -> held.add(route))`,
  `route.resume()`, with `n` items `APIResponse res = route.fetch();` then `route.fulfill(new Route.FulfillOptions().setResponse(res).setBody(<the first n items of res.text(), as JSON>))`,
  `route.fulfill(new Route.FulfillOptions().setStatus(200).setContentType("application/json").setBody("[]"))`,
  `route.fulfill(new Route.FulfillOptions().setStatus(500))`, `page.evaluate("window.__verifyBoxes.compare()")`.
- **Playwright, .NET.** `new BrowserNewContextOptions { ViewportSize = new() { Width = 390, Height = 844 } }`,
  `await context.AddInitScriptAsync(scriptPath: "$SKILL/measure-boxes.js")`,
  `await page.RouteAsync("**/api/items*", route => { held.Add(route); return Task.CompletedTask; })`,
  `await route.ContinueAsync()`, with `n` items `var res = await route.FetchAsync();` then `await route.FulfillAsync(new() { Response = res, Body = <the first n items of await res.TextAsync(), as JSON> })`,
  `await route.FulfillAsync(new() { Status = 200, ContentType = "application/json", Body = "[]" })`,
  `await route.FulfillAsync(new() { Status = 500 })`, `await page.EvaluateAsync<JsonElement>("window.__verifyBoxes.compare()")`.
- **Cypress.** `cy.viewport(390, 844)`. Helper:
  `cy.readFile('$SKILL/measure-boxes.js').then((src) => cy.visit(url, { onBeforeLoad: (win) => win.eval(src) }))`.
  Cypress cannot hold a request open, so delay it long enough to measure:
  `cy.intercept('GET', '**/api/items*', (req) => req.on('response', (res) => res.setDelay(5000)))`; with `n` items,
  `req.continue((res) => { res.body = res.body.slice(0, n); res.setDelay(5000); })` in the same handler. Empty:
  `cy.intercept('GET', '**/api/items*', { body: [] })`. Error: `{ statusCode: 500 }`. Measure:
  `cy.window().then((win) => win.__verifyBoxes.compare())`.
- **WebdriverIO.** `await browser.setViewport({ width: 390, height: 844 })` (version 9; `setWindowSize` before it).
  Helper: `await browser.execute(src)` right after `browser.url(url)`, with `src` read from the file (the observer
  still reads the shifts recorded before it started). Empty and error through `const mock = await browser.mock('**/api/items*')`
  and `mock.respond([])` or `mock.respond({}, { statusCode: 500 })`, where the session supports mocking; `n` items:
  `mock.respond(items)` with `n` items saved from a real response. Loading: the app's own delay switch. Measure: `await browser.execute('return window.__verifyBoxes.compare()')`.
- **A browser tool's evaluate** (a browser MCP server, a built-in browser). Open the page, evaluate the text of
  `measure-boxes.js`, then `window.__verifyBoxes.skeleton()` and later `window.__verifyBoxes.compare()`. Hold the
  request with the tool's network control if it has one, else the app's own delay switch; `n` items: the tool's
  network control, or seed data or an app switch that returns `n`; set the size with its resize or viewport tool.

### When the skeleton does not match

Report each mismatch with its numbers, and each unpaired box. The skeleton is product code: ask before changing it.
On a yes, resize the skeleton to the measured real boxes (the style or component that draws it), then measure again
at every viewport and keep both reports; the fix holds only when the second measurement passes. Without a yes, the
mismatch stays in the report as a finding. In maintain mode (verify-app with the argument `maintain`), report only:
a mismatch is a product gap and the skeleton is never resized there. A `COUNT` or `FAILED` line is not fixed by
resizing either: change the held answer or the options and measure again.

## Cleanup

Run after every drive, including failed ones. Stop only what `$RUN/started.txt` lists, and only a process whose start
time still matches the record (a process ID can be reused). Remove `$RUN` last, after the checks, because it holds the
record.

```bash
TODO(verify-app) the preamble, then copy logs into $EV and stop what $RUN/started.txt lists, checking each process start time
```

Then confirm, and only then remove `$RUN`:

```bash
TODO(verify-app) the preamble, then confirm every recorded process is gone (and the port is free, for a server), git status --porcelain matches $RUN/git-status.before, and $EV has its files; then rm -rf -- "$RUN"
```

Never stop a process by name, never delete by a glob, never run `git clean -x`, never remove shared volumes.

## Helpers

TODO(verify-app) each script this skill ships, with its exact invocation, or "None." For an app with a screen, `measure-boxes.js` is one: browser JavaScript run inside the page, called as "States and skeletons" shows.

## Feature map

`features/README.md` indexes every mapped feature. A proof that drives one entry point is incomplete when the map
lists others. Never weaken a journey to make it pass: a missing precondition is a failure, and its reason goes in the
feature's Gotchas.

## Not yet proven on the real target

The real target is where users run the app. A run here may stand in for parts of it: a local database instead of the
managed one, a mock mail server instead of the real provider, Linux instead of the Windows machines users have, a
simulator instead of a phone, a fresh container instead of a long-lived server with old data.

TODO(verify-app) each stand-in this skill's runs use, and the setup step the stand-in did that the target will not; or "None: the runs use what users use."
