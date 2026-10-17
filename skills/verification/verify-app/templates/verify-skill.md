---
name: verify-<app>
description: "TODO(verify-app): Launch <app>, drive its <surface> the way a user does, and keep evidence. Use when asked to verify, reproduce or show proof of a change in <app>, or before calling a change to <app> done."
---

# Verify <app>

TODO(verify-app): one paragraph. What the app is, which surface this skill drives, and the surfaces it does not cover
yet.

Read this whole file before the first command. Then read `features/README.md` and the feature file for what you are
verifying. Every command runs from the repository root unless a step says otherwise.

## Run ID and folders

Every run picks one ID and uses it in every name it creates:

```bash
TODO(verify-app): the commands that set RUN_ID, the scratch folder RUN (deleted in Cleanup) and the evidence folder EV
(kept), for example:
RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
RUN="${TMPDIR:-/tmp}/verify-<app>-$RUN_ID"
EV=".verify-evidence/$RUN_ID"
mkdir -p "$RUN" "$EV"
```

Isolation: TODO(verify-app): can two instances run side by side (ports, data folders, profiles)? If not: never drive
an instance this run did not start; stop and tell the user instead.

## Launch

TODO(verify-app): the commands that install or build once, then start the app for verification from an empty data
folder, including migrations and seed data. Write the process ID (and anything else the run starts) to
`$RUN/started.txt`.

Ready when: TODO(verify-app): the condition that proves a user could act now (a log line, a health check that covers
the data store), and the bounded wait for it. An open port is not enough.

TODO(verify-app): for a short-lived CLI or TUI, say instead that Launch builds once and each drive gets its own
isolated session (config and data folders, terminal session).

## Doctor

Run before the first drive, after any failed drive, and after anything surprising. It changes nothing.

```bash
TODO(verify-app): one command or short script that checks: the process is up, it is the one this run started
(process ID, port owner, data folder), it runs the build under test (version or commit), sign-in is valid.
```

Healthy means: TODO(verify-app): the exact output to expect. Anything else: do not drive; fix or relaunch. When the
doctor passes but the app looks wrong (a stuck screen), reset to a known state or relaunch.

## Drive

Harness: TODO(verify-app): the harness, and the file in this repository it comes from.

TODO(verify-app): how to send one action and read one result with that harness, with real handles from this repository
(roles and accessible names, labels, test IDs, prompt strings, routes) and the source file of each. Wait on
conditions, never on fixed sleeps. The recipes per feature are in `features/`.

## Evidence

Evidence folder: `.verify-evidence/<run-id>/`

The folder is ignored by git and Cleanup never touches it. TODO(verify-app): what to capture for this surface
(screenshots, accessibility snapshots, terminal transcripts, request and response bodies, logs, exit codes) and the
file names.

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

Run after every drive, including failed ones.

```bash
TODO(verify-app): stop only what $RUN/started.txt lists, by its IDs; remove $RUN and any scaffolding; leave $EV.
```

Then confirm: TODO(verify-app): the port is free, the process IDs are gone, and the evidence folder still has its
files. Never stop a process by name, never run `git clean -x`, never remove shared volumes.

## Helpers

TODO(verify-app): each script this skill ships, with its exact invocation, or "None."

## Feature map

`features/README.md` indexes every mapped feature. A proof that drives one entry point is incomplete when the map
lists others. Never weaken a journey to make it pass: a missing precondition is a failure, and its reason goes in the
feature's Gotchas.

## Not yet proven on the real target

TODO(verify-app): the setup steps a stand-in environment did that the real target will not, or "None: proven on the
target."
