# project-setup evals

These evals run the `project-setup` skill end to end against simulated users and grade what happens. They call a
real model, so they are not part of `npm test`. Run them by hand after you change the skill.

## Run

```bash
node evals/project-setup/run.mjs                          # every scenario, with the skill
node evals/project-setup/run.mjs --baseline               # the same scenarios without the skill, to compare
node evals/project-setup/run.mjs --scenario nervous-beginner --max-turns 20
```

Options: `--max-turns <n>` (default 40), `--out <dir>` (default: a fresh folder under the system temp folder for each
run; its path is the first line the run prints), `--model` for the assistant, `--persona-model` for the simulated
user and the judge, and `--no-judge` to skip the model-graded rubric. An `--out` inside this repository is refused
before any model call: Claude Code loads the CLAUDE.md files of parent folders, so the assistant, the persona and the
judge would read this repository's own CLAUDE.md.

The default folder is outside the repository, and a folder inside it (also through a link, or a `TMPDIR` inside it) is
refused. So is a folder with a `CLAUDE.md`, `CLAUDE.local.md` or `.claude/CLAUDE.md` in it or in any parent, such as
a worktree that sits inside another checkout. With the old default `--out`, inside this repository, the old persona prompt kept `spanish-beginner` going
after its first task. `run.mjs` never deletes its output folder, and the system may clear its temp folder, so pass
`--out` to keep a run.

Most scenarios take 15 to 30 turns and cost real usage: a run at the 30-turn limit cost about 28 US dollars with
`claude-opus-5-5` in October 2026, with the old default `--out`, inside this repository. The 20-turn `spanish-beginner`
run outside the repository cost 6.98 US dollars. Both figures count the assistant's calls only. The printed cost now
counts the assistant's, the persona's and the judge's calls, and `summary.json` holds `costUsd` (the total) and
`costPartsUsd` (the three parts). With `--no-judge` the judge part is 0. Each run needs the `claude` CLI, logged in.

## How it works

1. `run.mjs` copies a fixture project into a fresh folder and makes it a git repository. The fixture is a folder in
   `fixtures/` (the scenario's `fixture`) or any folder inside this repository (its `fixturePath`).
2. It installs the skill as a standalone personal skill in a sandboxed `HOME`, so the real `~/.claude` is never
   touched. This also proves the skill works without the plugin.
3. It sends the opening message to `claude -p`, then resumes the same session one turn at a time.
   `AskUserQuestion` is turned off, because nobody can answer it in `-p` mode, so the skill must use its plain
   numbered-options fallback.
4. A second `claude -p` plays the persona (`personas/*.md`) and writes each user reply. Its prompt starts with an end
   rule that wins over the persona: once the assistant said it wrote the project CLAUDE.md and after that recommended
   a first task, the persona said which task to do, and after that an assistant message works on that task, the
   persona replies `[END]`. The persona does not take part in the task. The run ends on a reply that holds `[END]`
   anywhere.
5. `grade.mjs` runs the mechanical checks. `JUDGE.md` is the rubric for a model-graded score from 1 to 5 per item.

## What the mechanical checks cover

- The introduction comes first and alone: the first agent turn only loads the skill and reads the skill's own files,
  and its first message asks whether to start. A baseline run skips this check.
- A project CLAUDE.md exists, is short, has no personal preferences, and imports `@AGENTS.md` when one exists.
- Every setup file (CLAUDE.md, CLAUDE.local.md, `.gitignore`) is written only in the turn after the user approved a
  draft that was shown in full.
- Personal preferences go where the persona asked (all projects, this project only, or nowhere), and earlier
  personal notes survive.
- No settings file changes.
- The skill never opens `.env`, and the fake key in it never appears anywhere.
- At most one message in five asks more than one question.
- The written CLAUDE.md and the chat use short sentences and no dashes.
- When a scenario lists `productionRules`, the "Production rules" section of the project CLAUDE.md (a level 2 or 3
  heading, in any case) holds exactly those rules, no more and no fewer. The heading and the bold rule names are
  matched in English, as `PRODUCTION-RULES.md` names them.

`tests/project-setup-eval.test.mjs` tests the grader itself, without a model. `tests/project-setup-eval-run.test.mjs`
tests the fixture copy, the scenario list, the entry-point guards of `run.mjs` and `grade.mjs` (also through a
symlink), and the default turn limit. `tests/project-setup-eval-persona.test.mjs` tests when a persona reply ends the
run, the turn loop, the end rule in the persona's prompt and the persona call's arguments.
`tests/project-setup-eval-replay.test.mjs` tests `replay.mjs` with a fake persona call.
`tests/project-setup-eval-out.test.mjs` tests the output folder: no folder on import or option parsing, a fresh temp
folder per run printed first, and the refusal of a folder inside the repository (also through links and a missing
tail) before any model call. `tests/project-setup-eval-cost.test.mjs` runs a scenario and `main` with a fake `claude`
and checks that the cost counts the assistant, the persona and the judge, each part rounded once.

## Replay a run

```bash
node evals/project-setup/replay.mjs <run dir> --turns <n> --prompt base|new [--times 4] [--persona-model <model>]
```

`replay.mjs` takes a run folder that `run.mjs` wrote, `<out>/<scenario>[-baseline]`; the first line `run.mjs` printed
names `<out>`. It cuts the conversation after a chosen turn, and asks the persona
for its next message `--times` times. `--prompt base` is the persona prompt from before Q13, kept as the control;
`--prompt new` is the current one. `--turns n` keeps the conversation up to the assistant's n-th message. The progress
lines of `run.mjs` count from 0, so its "turn 20" is `--turns 21`.

It prints the cut and the start of the last assistant message, then one line per reply (`ENDS` or `goes on`), then how
many replies end the conversation and the cost. It writes `replay-<prompt>-<turns>.json` in the run folder, so runs at
different cuts do not overwrite each other. Each time is one real persona call, so it costs real usage.

## Results, October 2026

Last full round, with the default model. "Without" is `--baseline`: the same persona asks plain Claude Code to set up
the project and write a CLAUDE.md. The judge scores are 1 to 5.

| Scenario | Checks with | Checks without | Transparency with / without | Lowest judge score with |
|---|---|---|---|---|
| `nervous-beginner` | 11/11 (1 skipped) | 9/11 | 4 / 1 | 4 |
| `hobbyist-empty-folder` | 11/11 | 9/10 | 4 / 1 | 3 |
| `experienced-dev` | 15/15 | 11/14 | 3 / 2 | 3 |
| `spanish-beginner` | 19/19 | not run | 4 / not run | 3 |
| `shop-owner` | 15/15 | not run | 4 / not run | 3 |
| `python-cli-dev` | 13/13 | not run | 3 / not run | 3 |

Without the skill, every run wrote CLAUDE.md before it showed any draft, and neither persona who wanted personal
preferences saved got them saved. (The beginner baseline still passes the approval check, because its opening message
asks for a CLAUDE.md by name, which the grader counts as a request.) The skipped check is the write to
`~/.claude/CLAUDE.md`: Claude Code asks a person before that edit even when an allow rule matches, and `-p` mode
cannot answer, so it is tested by hand. The last three rows are from October 23, after Q11 (the introduction stop and
the two Q8 scenarios), with `claude-opus-5-5`. In `spanish-beginner` every reply and the project CLAUDE.md were in
Spanish, and the saved preferences named Spanish as the preferred language. Its row is from October 24, after Q13: it
ended at turn 20 of 40, once the assistant had started the first task (it used all 40 turns before the end rule moved
to the top of the persona's prompt), with `--out` outside the repository; the lowest judge score is honesty. Both new scenarios wrote exactly the expected production rules: Money, Input, The signed-in user and
Secrets for the web app, Secrets only for the CLI. The first three rows predate the introduction stop, which adds one
turn to every run. Every row before Q13 ran with the old default `--out`, inside this repository.

## Scenarios

| Scenario | Fixture | Persona |
|---|---|---|
| `nervous-beginner` | `chat-assistant`: a Python chat service that calls a private model endpoint | First Claude Code session, desktop app, wants to learn, full setup |
| `hobbyist-empty-folder` | none (empty folder) | Codes a little, terminal, Mix session, quick setup, no git, saves nothing |
| `experienced-dev` | `web-app`: TypeScript with an `AGENTS.md` and CI | Daily user, terminal, Build session, quick setup, preferences for this project only |
| `spanish-beginner` | `chat-assistant` | The nervous beginner, writing in Spanish: starts with `/project-setup full` plus "in Spanish", wants the project files in Spanish, saves preferences for this project only (the personal CLAUDE.md cannot be written in `-p` mode) |
| `shop-owner` | `tests/fixtures/launch-readiness/web-app`: the notes-shop web app in Node | Owns the app, not a developer, desktop app, full setup (reaches the production rules question and adds all), preferences for this project only |
| `python-cli-dev` | `tests/fixtures/launch-readiness/cli-tool`: the tally command-line tool in Python | Wrote the tool, terminal, Build session, quick setup (the rules come as defaults in the summary), saves nothing |

Fixture files that would affect this repository are stored under other names and renamed when copied:
`gitignore`, `env.example`, `env.canary` (becomes `.env`) and `github-workflows`. The renames apply to the copy only.
The two launch-readiness folders are used as they are, where they are, so `tests/launch-readiness.test.mjs` and
these evals share one copy.
