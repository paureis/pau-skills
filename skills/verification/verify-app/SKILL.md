---
name: verify-app
description: "Write or maintain the project's own verification skill and feature map, so any agent can launch the real app, drive it like a user and keep evidence. Use when the user says 'verify it in the app', 'make a verification skill', 'how can an agent test this app', 'prove it works end to end', 'maintain the verify skill', or the project has no scripted way to drive its app."
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

If you started this skill on your own, without the user typing its name or asking for it, first say in one or two
lines what it will do and what it will cost, and wait for a yes. If the user asked for it, go ahead.

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
- **Isolate.** Where does the app write: the current folder, `HOME`, the XDG folders, the temp folder, a configured
  path, a database? Each one must point into the run's own folder, or a drive changes the user's data (commands run
  from the repository root, so a file written "here" lands in the user's repository). Can two instances run side by
  side (ports, data folders, browser profiles)? If not, the generated skill says so and refuses to drive an instance
  it did not start. Refusing beats corrupting the user's own session.

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

Copy `${CLAUDE_SKILL_DIR}/templates/verify-skill.md` to `.claude/skills/verify-<app>/SKILL.md` and fill in every spot
marked `TODO(verify-app)` and every template token (`<app>`, `<surface>`, `<harness>`) from what steps 1 and 2 found;
check-map reports any left. `<app>` is a short lowercase name for the app. The frontmatter needs
`name: verify-<app>`, equal to the folder name, and a description that names the app, the surface and when to reach
for it: without them the skill never registers. The template's fixed text (the run-folder commands, the start-up
record, the proof rules) is written for a POSIX shell: keep it, and adapt it only when the project's commands run in
another shell, such as PowerShell. Every other command comes from this repository; no example command stays in the
file.

Required sections, checked by check-map: Launch, Doctor, Drive, Evidence and Cleanup, none empty, and Launch, Doctor
and Cleanup each with a command in a code block. The template also has Run folders, Helpers, Feature map and Not yet
proven on the real target; keep them (Helpers says "None." when there are none). What each section holds:

- **Run folders.** Fixed text: the run ID, the scratch folder `$RUN`, the evidence folder `$EV`, and the variables
  saved to `$RUN/env`, which every later command loads with `set -a` so the app sees them too. Each Bash tool call
  starts a fresh shell, so nothing else carries over. You fill in "Where the app writes": every location from step 1,
  and how each is pointed into `$RUN` (a variable, a flag, `env HOME=...`, or running the app from `$RUN/work`).
- **Launch.** For a server or a UI: the exact commands that build once and start the app, and how to tell it is
  ready. Ready means usable, not only that a process answers: a port can be open while migrations or a data load
  still run, so wait for the condition that proves a user could act now (a ready line in the log, a health check
  that covers the data store, the first page rendering its main control), from an empty data folder, including
  migrations and seed data. Record what started in `$RUN/started.txt`, and make sure the recorded process is the
  app's own (DRIVING.md, section 3). For a CLI, a TUI or a library nothing stays running: Launch builds or installs
  once, and each drive gets its own isolated session.
- **Doctor.** One read-only check that answers "is this instance worth driving?". For a server or a UI: the process
  is up, it is the one this run started (process ID or port owner against the record), it runs the build under test
  (version or commit), its data is in `$RUN`, sign-in is valid. For a CLI, a TUI or a library: the program the drive
  will run is the one built from this working tree, not another copy on `PATH`, and the write locations point into
  `$RUN`. Run it before the first drive, after any failed drive, and after anything surprising. When the doctor
  cannot see the failure (a stuck screen on a healthy process), reset to a known state or relaunch; do not hope.
- **Drive.** The harness and the real handles from this repository, with the file each came from: accessible roles
  and names, labels, test IDs, prompt strings, routes, command names. Prefer them over coordinates, tab order and
  CSS paths. Wait on a condition, never on a fixed sleep.
- **Evidence.** Where proof goes and what counts as proof. The folder is inside the repository, ignored by git, and
  outside everything Cleanup deletes, so the proof survives the teardown. It is written on a line of its own as
  `` Evidence folder: `<path>` `` (check-map.mjs reads that line). Add the folder to `.gitignore`, creating the file
  when the project has none, and show the line. Each run has its own subfolder, each feature a subfolder in that,
  and each step numbered files: `01-<step>.cmd` (exactly what ran), `.out`, `.err`, `.exit`, and screenshots,
  snapshots or response bodies as the surface needs. The proof rules in the template stay as they are.
- **Cleanup.** Stop only what `$RUN/started.txt` lists, checking that each process still has its recorded start time
  (a process ID can be reused), and delete only the paths it lists. Never by process name (`pkill`, `killall`,
  `taskkill /IM`), never by a glob, never with a command that wipes ignored files (`git clean -x`), never by removing
  shared volumes. Then confirm: every recorded process is gone, the port is free (for a server), the output of
  `git status --porcelain` is what it was when the run started (nothing escaped into the repository), and the evidence is still
  there. Remove `$RUN` last, because it holds the record. DRIVING.md, section 3, has the commands.
- **Helpers.** Optional. Any script the skill ships sits in its folder, can be run as written, and its exact
  invocation is shown in the section that uses it. A helper the reader has to work out is not a helper.
- **Not yet proven on the real target.** The real target is where users run the app; a local run may stand in for
  parts of it. For example, the runs use a local PostgreSQL in a container while users hit a managed database with
  its own extensions and permissions, or a mock mail server instead of the real provider, or Linux while users are
  on Windows. List each stand-in and what it does that the real target will not, or write that there are none.

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

It checks the frontmatter, the five required sections (none empty; Launch, Doctor and Cleanup with a command in a
code block), the evidence line, leftover `TODO(verify-app)` markers and template tokens, that the index matches the
feature files on disk (subfolders of `features/` count), the four headings in every feature file, and that the
evidence folder is ignored by git with nothing in it tracked. Fix every problem it prints. A clean result means the
shape is right, not that the commands work: step 6 proves those.

### 6. Prove it once, end to end

A generated skill that was never executed is a draft. Run its instructions as written, once: launch, doctor, drive one
mapped feature (one is enough; the map is there so later runs can cover the rest), keep the evidence, clean up.

- The honest test is a reader who has not seen this conversation, with only this brief: "Follow
  `.claude/skills/verify-<app>/SKILL.md` to verify the feature in `features/<file>.md`. Report each command you ran,
  what you saw, where the evidence is, and every place the instructions were unclear or wrong."
  - If you can start a subagent (the Agent tool), give it the brief.
  - Otherwise, a fresh session: ask the user to open a new Claude Code session in the repository and paste the brief,
    or run `claude -p "<the brief>"` from the repository root if the user agrees (it needs permission to run the
    commands, like any session).
  - Only when neither is possible, follow the file yourself, using only what it says. This is the weaker test,
    because you know what the file meant to say; say so in the report.
- After cleanup, confirm that the evidence still exists at the named folder, that nothing the run started is still
  running (the recorded processes are gone, the port is free for a server), and that `git status` shows nothing new
  outside the evidence folder. A cleanup that eats the proof fails this step.
- Fix what failed, and run the generated Cleanup after every failed attempt too, so broken attempts leave no process
  or port behind. A step that failed may already have changed the app's data, so relaunch from empty before trying
  again rather than carrying on with the same instance.
- If the run used a stand-in for the real target (see "Not yet proven on the real target" in step 3: a container
  instead of a fresh machine, a local database instead of the managed one), list every setup step the stand-in did
  that the target will not, in that section of the generated skill. Those steps stay unproven until a run on the
  real target covers them.

### 7. Hand it over

Report, then offer to commit the skill folder and the `.gitignore` line: the skill is project infrastructure, so every
person and agent drives the app the same way. Commit only on a yes. Say that this skill with the argument `maintain` keeps
the map honest when the app changes (`/verification:verify-app maintain` from the plugin, `/verify-app maintain` when
the skill is installed on its own); suggest a schedule only if the user asks.

```
Verify skill: .claude/skills/verify-<app>/ (<surface>, harness <harness>)
Features mapped: <n>: <names>; not covered yet: <surfaces or features, or none>
check-map: clean
End-to-end run: <feature> by <subagent | fresh session | me, the weaker test>: launch <ok>, doctor <ok>, drive <ok>, evidence at <path> (kept after cleanup), cleanup <ok>
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
