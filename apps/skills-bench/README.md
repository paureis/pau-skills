# Skills Bench

Does a skill change the outcome of real tasks? The Skills Bench pilot (backlog item Q45) runs each task with and
without its skill, on one pinned model, within a cap, and measures the difference. It is built on the `skill-eval`
harness (`skills/verification/skill-eval/`), which keeps every run blind to the setup.

This folder is repository tooling, not a skill or a plugin: nothing here is installed.

## Files

- `bench.mjs`: the runner. `plan`, `run`, `judge`, `owner-sheet`, `owner-grades` and `export`; its header lists the
  options.
- `lib/run/`: the runner's modules (command line, tasks and contract 1 checks, plan and start rule, run, collecting
  results and grading, judge, owner sheet, export).
- `pilot.json`: the pilot's settings: tasks folder, skill folders, controls, runs per variant, cap, prices per run by
  difficulty, judge price, hard stop factor, parallel runs and run order. It names no model: `--model` is required.
- `FORMAT.md`: the task, grader and results formats, and the owner sheet.
- `RUNBOOK.md`: the steps of a pilot round, B0 to B7, with every command.
- `tasks/`, `variants/`, `analyse.mjs` and `results/` come from the other parts of Q45.

## What a round does

1. `plan` lists the runs, the estimate, the hard stop per run and what the start rule needs per task, and refuses
   when the estimate passes the cap. It calls no model.
2. `run` gives each task its own skill-eval lab and run root, runs 3 runs per variant (`with`, `without`, and on the
   control tasks `broken` and `empty`), and starts a task only when what is spent, its runs at their hard stop and the
   judge reserve stay within `--max-usd`. Every run is graded by the task's `grade.mjs` on a copy of its folder.
3. `judge` asks one blind judge per task, scores mapped back to runs through skill-eval's key.
4. `owner-sheet` picks 10 runs for the owner to grade by hand; `owner-grades` reads the grades back.
5. `export` writes the round in contract 3, with machine paths, environment values and emails replaced.

The tests are `tests/skills-bench-runner*.test.mjs`, with a fake claude in `tests/fixtures/skills-bench/runner/`; they
never call a model.
