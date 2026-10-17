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

TODO(verify-app) each script this skill ships, with its exact invocation, or "None."

## Feature map

`features/README.md` indexes every mapped feature. A proof that drives one entry point is incomplete when the map
lists others. Never weaken a journey to make it pass: a missing precondition is a failure, and its reason goes in the
feature's Gotchas.

## Not yet proven on the real target

The real target is where users run the app. A run here may stand in for parts of it: a local database instead of the
managed one, a mock mail server instead of the real provider, Linux instead of the Windows machines users have, a
simulator instead of a phone, a fresh container instead of a long-lived server with old data.

TODO(verify-app) each stand-in this skill's runs use, and the setup step the stand-in did that the target will not; or "None: the runs use what users use."
