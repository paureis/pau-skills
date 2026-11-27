---
name: wizard
description: "Walk a person through setup steps only they can do (create an API key, set a secret, click through a dashboard, approve an app) with a script that shows one step at a time and checks each one without reading the secret. Use when work is blocked on such a step, or the user says 'walk me through the setup' or 'make me a setup wizard'. Not for steps the agent can run itself."
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from mattpocock/skills; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/6f7f7831a625f040a8e06a0e7954826b87ce775a/skills/engineering/wizard
---

# Wizard

Some setup steps only a person can do: create an API key, set a secret, click through a dashboard, approve an app.
A paragraph of instructions in the chat scrolls away. Instead, write the steps as a JSON steps file. The person runs
one fixed script on it, `${CLAUDE_SKILL_DIR}/wizard.mjs`, which shows one step at a time, opens the page, and checks
each step before it goes on. Afterwards you run the same script to confirm.

The person puts each value in place themselves: a line in `.env`, `gh secret set NAME`, a field in a dashboard. The
script never asks for a value and never stores, prints or logs one. It only checks that the value is where it belongs.

Not for steps you can do yourself: do those.

Never ask the person to paste a secret into the chat. If they do, tell them it is now in this conversation's context
and suggest they rotate it.

## 1. Scope the steps

Read the repository first; do not ask cold. Look at:

- env example files (`.env.example`, `.env.sample`, `.env.template` and the like) and compose files;
- framework config, for example .NET user-secrets, Rails credentials, Django settings, Spring `application.*`,
  Terraform variables;
- CI files: GitHub Actions `secrets.*` and `vars.*`, GitLab CI variables, CircleCI contexts, Azure Pipelines variable
  groups, Bitbucket repository variables, Jenkins credentials;
- the README.

Show the person the ordered list of steps: for each value, where it comes from, where it goes and whether it is
secret. Wait for their yes before you write anything. They may add, drop or reorder steps.

## 2. Map each step's exact path

For each step, write the path a stranger could follow: the URL, what to click, where the value appears and where to
put it (for example "Developers, API keys, Create key, copy it, then add `PAYMENTS_KEY=` and the key to `.env`").
Never invent UI you do not know: ask the person, or check the docs.

## 3. Write the steps file and check it

Keep it ephemeral by default: a scratch folder or `scripts/`. Commit it only when the user wants a repeatable setup
path. Copy the shape of `${CLAUDE_SKILL_DIR}/example-steps.json`:

- Top level: `title` and `steps`, nothing else.
- A step: `id` (unique), `title` and `checks` (at least one) are required. `say` (lines to show), `open` (an http or
  https URL to open in the browser), `command` and `confirm` are optional. Set `confirm: true` on an irreversible
  step: the person must answer y before it goes on.
- A check holds exactly one kind: `{"file": path}` (the path exists), `{"env": NAME}` (set in the wizard's own
  environment), `{"envFile": path, "key": NAME}` (a non-empty `NAME=` line in a dotenv file), `{"url": url,
  "status": 200}` (a GET answers with that status, no redirects followed), `{"command": [argv]}` (exits 0).

There are two kinds of `command`. A step's `command` is a string: text shown for the person to type in their own
terminal, such as `gh secret set PAYMENTS_KEY`. The wizard never runs it. A `command` check is an argv array the
wizard runs without a shell, with its output discarded; it passes when it exits 0. On Windows a `command` check cannot
run a `.cmd` or `.bat` shim (npx, many CLIs) without a shell, which the wizard never uses: point it at the real `.exe`,
or use a `url` or `file` check.

A relative path in a check is read from the folder the wizard runs in, not the steps file's folder.

An `env` check sees only the terminal that runs the wizard. A variable the person sets in another terminal is not
seen there: they set it and start again, or you use an `envFile` or `command` check instead.

`check` refuses a step with an empty checks list. When nothing obvious can check a step, find a check (a `command`
such as `gh api repos/OWNER/REPO/actions/secrets/PAYMENTS_KEY`, or a `url`), or leave the step out of the file and
ask the person about it in the chat.

Run `node ${CLAUDE_SKILL_DIR}/wizard.mjs check <file>` until it passes. It runs nothing and names each problem by its
place in the file.

## 4. Hand off

The person needs Node 20 or later. Run `node --version`. If it is missing or below 20, give the steps one at a time
in the chat instead, and check each one with your own commands without reading any value (an exit code, not the
file's text).

Give the person the full command to type in their own terminal, from the project root, with that folder named:
`node <absolute path to wizard.mjs> run <steps file>`. Add `--no-open` if they do not want browser tabs opened. Never
run `run` yourself: it waits on a person. A step that already passes is passed over, so running it again resumes.

When they say they are done, run `node ${CLAUDE_SKILL_DIR}/wizard.mjs status <file>` from the same folder and report
the result: exit 0 means every step is done; otherwise it names each check that failed. Delete an ephemeral steps
file once every step is done. A committed, repeatable steps file may be linked from the project README only when the
user wants it, after you ask.
