---
name: verify-app
description: "Generate, or maintain, a project skill (.claude/skills/verify-<app>) that launches the real app, drives it like a user (web, CLI, TUI, HTTP, mobile), keeps evidence and cleans up. Use when the user says \"verify it in the app\", \"make a verification skill\", \"how can an agent test this app\", \"prove it works end to end\", \"maintain the verify skill\", or when a project has no scripted way to drive it."
argument-hint: "[maintain] [the app or surface to cover, when the repository has several]"
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/create-verification-skill
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
---

# Verify app

A project needs one scripted way to start the real application, use it the way a user does, and keep proof of what
happened. This skill writes that down as a project skill, `.claude/skills/verify-<app>/`, and later keeps it honest
as the app changes. Its reader is the next agent: it arrives cold, in the middle of another task, and has never seen
the app. Write every line for that reader: exact commands, real selectors, results it can observe.

Arguments: $ARGUMENTS

## Pick the mode

- The arguments start with `maintain`: **maintain mode**. Read `${CLAUDE_SKILL_DIR}/MAINTAIN.md` and follow it.
- The project already has a `.claude/skills/verify-*/` folder and the user wants a change checked: this skill is not
  needed. Read that folder's `SKILL.md` and follow it. If the user asked for a new one anyway, say one exists and
  offer maintain mode instead of writing a second.
- Otherwise: **create mode**, below.

Bundled files, all read only:

- `${CLAUDE_SKILL_DIR}/DRIVING.md`: how to find the project's own end-to-end harness, and what to use without one,
  per surface (web, CLI, TUI, HTTP, mobile, desktop, library). Read it before step 1.
- `${CLAUDE_SKILL_DIR}/templates/verify-skill.md` and `${CLAUDE_SKILL_DIR}/templates/feature.md`: the files you
  generate. Every spot to fill is marked `TODO(verify-app)`.
- `${CLAUDE_SKILL_DIR}/references/feature-map-example/`: a worked feature map, an index and three feature files.
- `${CLAUDE_SKILL_DIR}/check-map.mjs` (Node 20+, no dependencies): checks a generated skill. Exit 0 clean, 1
  problems, 2 usage.

## Create mode

### 1. Interview the repository, not the user

Answer each question from the code, and write down the file each answer came from. Ask the user only what the files
cannot show, one question at a time (with AskUserQuestion when it is available).

- **Surface.** What does a user actually touch: a web UI, a CLI or TUI, an HTTP or gRPC API, a mobile app, a desktop
  app, a library? A repository can have several. Pick the main one (or the one the arguments name) and list the rest
  in the generated skill as not covered yet.
- **Run.** How does it start locally? Prefer the project's own documented command: the README quick start, the
  manifest's scripts, `Makefile`, `justfile`, compose files, the CI job that runs end-to-end tests. Note ports,
  environment variables (names only, never values), seed data, migrations and sign-in.
- **Drive.** How can an agent use it from a script? The project's own harness first (DRIVING.md, section 1). Only
  without one, the fallback for the surface (section 2).
- **Observe.** What proof can be captured: screenshots, accessibility snapshots, terminal transcripts, response
  bodies, logs, exit codes, files written, rows stored, messages sent.
- **Isolate.** Can two instances run side by side (ports, data folders, browser profiles, config folders)? If not,
  the generated skill says so and refuses to drive an instance it did not start. Refusing beats corrupting the
  user's own session.

### 2. Make it start

Build and launch the app the way you found, from an empty data state. A skill written against a broken checkout
teaches wrong steps.

- A setup problem with a small fix (dependencies not installed, a sample config to copy): fix it and put the step in
  Launch.
- A fix that needs product code: show it to the user and ask before you change anything.
- Anything else: stop and report the command, the output and what is missing.

When an asset the surface never uses blocks start-up (a static folder an API never serves, a sample file), the
generated skill may create it. Mark it as verification scaffolding and remove it in Cleanup.

### 3. Write the skill

Copy `${CLAUDE_SKILL_DIR}/templates/verify-skill.md` to `.claude/skills/verify-<app>/SKILL.md`, with `<app>` a short
lowercase name for the app, and fill in every `TODO(verify-app)` from what steps 1 and 2 found. The frontmatter
needs `name: verify-<app>`, equal to the folder name, and a description that names the app, the surface and when to
reach for it: without them the skill never registers. Leave no placeholder and no example command that was not taken
from this repository. The sections:

- **Launch.** The exact commands that build once and start the app for verification, and how to tell it is ready.
  Ready means usable, not only that a process answers: a port can be open while migrations or a data load still run,
  so wait for the condition that proves a user could act now (a ready line in the log, a health check that covers
  the data store, the first page rendering its main control). Launch reaches that state from an empty data folder,
  including migrations and seed data. Record everything the run starts (process IDs, container IDs, terminal session
  names, temporary folders) in the run's scratch folder, and make sure the recorded ID is the app's own (DRIVING.md,
  section 3). Every command in the generated skill must work in a fresh shell, because each Bash tool call starts
  one: the template saves the run's variables to a file. For a short-lived CLI or TUI there is no server to keep up:
  launch means build or install once, then each drive gets its own isolated session (its own config and data
  folders, its own terminal session).
- **Doctor.** One read-only check that answers "is this instance worth driving?": the process is up, it is the one
  this run started (process ID, port owner, data folder), it runs the build under test (version or commit), sign-in
  is valid. Run it before the first drive, after any failed drive, and after anything surprising. When the doctor
  cannot see the failure (a stuck screen on a healthy process), reset to a known state or relaunch; do not hope.
- **Drive.** The harness and the real handles from this repository, with the file each came from: accessible roles
  and names, labels, test IDs, prompt strings, routes, command names. Prefer them over coordinates, tab order and
  CSS paths. Wait on a condition, never on a fixed sleep.
- **Evidence.** Where proof goes and what counts as proof. The folder is inside the repository, ignored by git, and
  outside everything Cleanup deletes, so the proof survives the teardown. Write it on a line of its own as
  `` Evidence folder: `<path>` `` (check-map.mjs reads that line), add the folder to `.gitignore` (show the line),
  and give each run its own subfolder, and each feature a subfolder in that, created before the feature's first step.
  The proof standards, written into the generated skill:
  - Use the real user path, never an internal setter, a test-only endpoint or a seeded shortcut.
  - Capture the action and the state it produced, not only the final screen.
  - Check side effects as well as what is visible (a file written, a row stored, a message sent), through a second,
    read-only view.
  - Mock only where a production boundary already isolates the external system.
  - A dry run or test mode is trusted only after you have observed what it skips (files, network, git refs). Some
    dry runs still call the network or open a browser.
- **Cleanup.** Stop only what this run started, by the IDs it recorded. Never by process name (`pkill`, `killall`,
  `taskkill /IM`), never with a command that wipes ignored files (`git clean -x`), never by removing shared volumes.
  Remove scratch state and scaffolding; leave the evidence. Then confirm the port is free and the evidence is still
  there.
- **Helpers.** Any script the skill ships sits in its folder, can be run as written, and its exact invocation is shown
  in the section that uses it. A helper the reader has to work out is not a helper.

### 4. Seed the feature map

Create `.claude/skills/verify-<app>/features/README.md` and one file per user-facing feature, from
`${CLAUDE_SKILL_DIR}/templates/feature.md`, following the shape in `${CLAUDE_SKILL_DIR}/references/feature-map-example/`.
Start with the 3 to 5 features a user meets first, found from routes, commands, menus and docs.

- The index sets the baseline state, the driving conventions and the proof rules, and links every feature file.
- Each feature file has a title, one paragraph on what the user sees, and exactly four sections: `Sub-features`,
  `How to get to it (user's point of view)`, `Driving it with <harness>` and `Gotchas`.
- Each step in `Driving it` pairs a user action with the exact command and the result that proves it.
- Never weaken a journey to make it pass. If the seed data lacks what a journey needs, the journey fails, and the
  reason goes in that feature's `Gotchas`.
- The map is the project's source for verification. A proof that drives one convenient entry point is incomplete
  when the map lists others.

### 5. Check it

```bash
node "${CLAUDE_SKILL_DIR}/check-map.mjs" .claude/skills/verify-<app>
```

It checks the frontmatter, the five sections and the evidence line, that the index matches the feature files on
disk, the four headings in every feature file, leftover `TODO(verify-app)` markers, and that the evidence folder is
ignored by git with nothing in it tracked. Fix every problem it prints.

### 6. Prove it once, end to end

A generated skill that was never executed is a draft. Run its instructions as written, once: launch, doctor, drive one
mapped feature (one is enough; the map is there so later runs can cover the rest), keep the evidence, clean up.

- The honest test is a reader who has not seen this conversation. If you can start a subagent (the Agent tool),
  give it only this brief: "Follow `.claude/skills/verify-<app>/SKILL.md` to verify the feature in
  `features/<file>.md`. Report each command you ran, what you saw, and where the evidence is." Without a subagent,
  follow the file yourself, using only what it says.
- After cleanup, confirm that the evidence still exists at the named folder and that nothing the run started is still
  running (the recorded process IDs are gone, the port is free). A cleanup that eats the proof fails this step.
- Fix what failed, and run the generated Cleanup after every failed attempt too, so broken attempts leave no process
  or port behind. A step that failed may already have changed the app's data, so relaunch from empty before trying
  again rather than carrying on with the same instance.
- If you proved it in a stand-in for the real target (a container instead of a fresh machine, a local stack instead
  of a remote one), list every setup step the stand-in did that the target will not. Put the list in the generated
  skill under "Not yet proven on the real target". Those steps stay unproven until a run there covers them.

### 7. Hand it over

Report, then offer to commit the skill folder and the `.gitignore` line: the skill is project infrastructure, so every
person and agent drives the app the same way. Commit only on a yes. Say that this skill with the argument `maintain` keeps
the map honest when the app changes (`/verification:verify-app maintain` from the plugin, `/verify-app maintain` when
the skill is installed on its own); suggest a schedule only if the user asks.

```
Verify skill: .claude/skills/verify-<app>/ (<surface>, harness <harness>)
Features mapped: <n>: <names>; not covered yet: <surfaces or features, or none>
check-map: clean
End-to-end run: <feature> by <subagent | me>: launch <ok>, doctor <ok>, drive <ok>, evidence at <path> (kept after cleanup), cleanup <ok>
Fixed to make it start: <list, or none>
Not yet proven on the real target: <list, or none>
Questions for the user: <list, or none>
```

## Rules

- Never drive an instance this run did not start, unless the generated skill says the instance is shared and the user
  agreed.
- Never weaken a journey, a check or the map to make a run pass. A failure is a finding.
- Never keep evidence where Cleanup deletes it.
- Never stop a process by name, and never stop what another session started.
- Never put a secret in the generated skill or in evidence. Record variable names, and redact tokens from captured
  requests and logs.
- Never change product code without the user's yes. In maintain mode, never change it at all.
