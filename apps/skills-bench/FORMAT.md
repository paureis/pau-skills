# Skills Bench formats

The formats the pilot (Q45) works in: the tasks (contract 1), the grader (contract 2), the results (contract 3) and
the owner sheet. `bench.mjs` checks contract 1 before any setup, calls graders in contract 2 and writes contract 3 with
`export`. Q46 builds on contract 3.

## Contract 1: tasks

`apps/skills-bench/tasks/<skill>/` holds `grade.mjs`, `rubric.md` and one folder per task, `<task-id>/`, named with
lowercase letters, digits and `-`. Task ids differ across skills too: they name the lab folders. Per skill there are 2
simple, 2 medium and 1 complex task (the runner warns when the count differs).

`task.json`:

```json
{
  "id": "<task-id>",
  "skill": "tdd",
  "difficulty": "simple",
  "slug": "<project folder name a user would pick>",
  "summary": "<one line, true for every variant>",
  "allowTools": ["Bash(npm test)", "Bash(node *)", "Bash(git *)"],
  "allowWords": ["test"],
  "timeoutMin": 15,
  "control": false,
  "interface": ["src/cart.js"]
}
```

- `skill` is `tdd` or `bug-fix`; `difficulty` is `simple`, `medium` or `complex`.
- `slug` has letters, digits and `-` only, and no word a run must not see (skill-eval's META_WORDS, in any form).
- `summary` is the `Task:` line of the judge's rubric, so it must fit every variant.
- `allowTools` holds the three rules above; bug-fix tasks add `"Bash(npm test *)"`.
- `allowWords` lists the META_WORDS skill-eval may let through; a tdd task must list `"test"`.
- `timeoutMin` is 15 for simple and medium tasks and 30 for complex ones.
- `control` is true on one simple and one medium tdd task: those also run the two controls.
- tdd adds `interface`: paths relative to `start/` that the hidden tests import. bug-fix may add `maxFixLines`.
- Other fields are allowed; the runner reads id, skill, difficulty, slug, summary, allowTools, allowWords, timeoutMin
  and control.

Size by difficulty, in source lines (tests not counted): simple, one module of about 30 to 80 lines; medium, 2 to 3
modules, about 100 to 250 lines; complex, 5 or more modules, about 400 to 800 lines, with a behaviour or bug that
crosses modules. Every file is under 20,000 bytes.

`prompt.txt` is what a user would type: no META_WORDS except forms of "test", never a slash command.

`start/` is the project as a run gets it: Node only, no dependencies, a `package.json` with `"test": "node --test"`,
existing tests green. It has no `.git`, no links, no `.claude`, `CLAUDE.md` or `AGENTS.md`, and no file or folder name
with a META_WORDS word other than "test".

Never copied into a run: `hidden/`, `reference/` and the overlays (tdd: `bad/<name>/` and `weak/`; bug-fix:
`symptom-patch/`, `edited-test/` and `long-fix/`). An overlay is a folder of files laid over a copy of `start/` at the
same relative paths. Only `start/` goes to skill-eval setup, so none of these can reach a run.

`rubric.md` has 3 to 6 numbered criteria lines (`1. ...`) and optional HTML comments, nothing else. It names no
variant, version, skill or change; each criterion is a property of a good result that any run could have. One rubric
per skill, so criterion numbers are per skill.

Controls: `apps/skills-bench/variants/tdd-broken/` and `apps/skills-bench/variants/tdd-empty/`, each a skill folder
whose `SKILL.md` says `name: tdd`.

## Contract 2: the grader

```bash
node apps/skills-bench/tasks/<skill>/grade.mjs --task <task folder> --run <run folder>
```

`--task` is the task folder in the repository. `--run` is a copy of the run's working folder after the run (the
project with its git history); the runner makes the copy, so a grader can never change what blind reads later. The
grader gets an empty HOME, only skill-eval's allowlisted variables and an empty working folder.

It prints exactly one JSON line on standard output:

```json
{ "pass": true, "score": 0.75, "checks": [ { "name": "fixed", "kind": "outcome", "required": true, "pass": true, "detail": "the bug no longer shows" } ] }
```

- `kind` is `outcome` or `process`. `pass` is true when every required check passes; `score` is passed checks over
  all checks.
- Exit 0 when it graded (whatever the grade), exit 1 when it could not, with the reason on standard error.
- It works on a temporary copy, never writes into `--run` or `--task`, uses no network, is deterministic and finishes
  within 5 minutes (the runner kills it then).

The runner adds `outcomeScore`: passed outcome checks over outcome checks, or null when there are none. A grader that
exits 1, times out or prints anything but one such line gives `grade: null` and a `gradeError` sentence.

## Contract 3: results

`apps/skills-bench/results/<round-id>/`, with `<round-id>` = `<yyyy-mm-dd>-<4 hex>`. Money is in whole micro-dollars
(1 US dollar is 1,000,000). A cost claude reports as a float is turned into micro-dollars once, when it is read,
rounded half up.

`round.json`:

```json
{
  "format": "skills-bench-results/1", "roundId": "2026-11-28-1a2b", "startedAt": "<ISO time>", "endedAt": "<ISO time>",
  "model": "<id>", "modelsReported": ["<model ids the transcripts name>"], "judgeModel": "<id or null>",
  "claudeVersion": "<first line of claude --version, or unknown>", "auth": "login | api-key | unknown",
  "currency": "USD", "capMicros": 40000000, "spentMicros": 0, "estimateMicros": 0, "n": 3, "calibration": false,
  "variantSources": { "tdd/with": "skills/verification/tdd at <commit>" },
  "tasks": [ { "skill": "tdd", "task": "<id>", "difficulty": "simple", "variants": ["with", "without"],
    "status": "done | not run (cap) | failed", "runsPlanned": 6, "runsMade": 6, "hardStopMicros": 300000 } ]
}
```

- `auth` comes from `export --auth`, never from the environment.
- `spentMicros` is everything charged against the cap: each run's cost from its result line, its hard stop when it
  has none, and each judge call (its cost, or hardStopFactor x usdPerJudge when it reports none).
- `estimateMicros` is the plan's estimate when the round started.
- `variantSources` is keyed `<skill>/<variant>`, because `with` is a different folder for each skill. A folder with
  uncommitted changes when the round started says so after the commit.
- `runsMade` counts the runs skill-eval started; a run that started and left no result line is a dropout.
- `calibration` is true for a round run with `--only` and `--n 1`.

`<skill>/<task>/<variant>/<n>/result.json`, with variant `with`, `without`, `broken` or `empty` and n from 1:

```json
{
  "format": "skills-bench-run/1", "roundId": "...", "skill": "tdd", "task": "<id>", "difficulty": "simple",
  "variant": "with", "n": 1, "runId": "<4 hex>", "finished": true, "exit": 0, "resultSubtype": "success",
  "seconds": 95, "costMicros": 140000, "turns": 12, "toolCalls": 20, "failedToolCalls": 2, "denials": 0,
  "skillStarted": true,
  "process": { "firstTestEditStep": 3, "firstSourceEditStep": 7, "failedCommandBeforeFirstSourceEdit": true },
  "grade": { "pass": true, "score": 1, "checks": [], "outcomeScore": 1 }, "gradeError": null,
  "judge": { "1": 4, "2": 5, "3": 3 }, "judgeLetter": "C"
}
```

- `finished` is true when the transcript has a result line; `costMicros` is null when it has none.
- `exit` is the exit code of claude (null when it was killed); `resultSubtype` is the subtype of the last result line.
- `denials` counts the tool calls the permissions refused.
- `skillStarted` is true when a Skill step names the task's skill (or `<plugin>:<skill>`).
- Steps are numbered as skill-eval's `actions` numbers them. An edit is a Write, Edit, MultiEdit or NotebookEdit step.
  A test file is a path with a `test`, `tests` or `__tests__` part, or a name with `.test.`, `.spec.`, `_test.` or
  starting with `test_`; any other edited file is source. `failedCommandBeforeFirstSourceEdit` is true when a Bash
  step failed before the first source edit (anywhere, when there is none). Files written by a shell command are not
  seen.
- `judge` maps each criterion number to the judge's 1 to 5 score; null before judge, or when the run had no letter.

`judge/<skill>/<task>.json` is `{ "model", "costMicros", "criteria": [ { "n", "text" } ] }`, the criteria being that
skill's rubric and `costMicros` what was charged. `judge/<skill>/<task>.verdict.txt` is the judge's reply, cut to fit
20,000 bytes with a `[cut: ...]` marker line.

`owner/map.json` is `{ "A": { "skill", "task", "difficulty", "variant", "n" }, ..., "J": { ... } }`;
`owner/grades-tdd.txt` and `owner/grades-bug-fix.txt` hold the owner's grades in the score format below.

`summary.json` and `REPORT.md` are written by `analyse.mjs`.

Never in the results: a transcript, an absolute path, an environment value or an email. Export replaces paths with
`<project>` (a run folder), `<home>` (a run's HOME or yours), `<tmp>` (the round folder, a run root or a lab) and
`<repo>` (the repository), any environment value of 8 or more characters with `<env>`, a key-like `sk-` value with
`<key>` and an email with `<email>`. Then it reads every file back, fails on `/tmp`, `/root`, `/var/folders`,
`/private/var` or your HOME and removes what it wrote; it warns about a file over 20,000 bytes. Text a model wrote is
only in `.txt` files.

## The owner sheet

Not committed. `owner-sheet` writes a new folder with `A.txt` to `J.txt` (A to E are tdd runs, F to J bug-fix runs),
`rubric-tdd.txt`, `rubric-bug-fix.txt`, `grades-tdd.txt` and `grades-bug-fix.txt`, all plain UTF-8 text. Each skill's
5 runs are finished `with` or `without` runs that cover both variants and every difficulty, picked and shuffled with
the seed it prints. A letter file starts with the run's `Task:` line and its prompt, then the run's blind text from
skill-eval with its heading renamed `# Output <letter>`. It holds no variant field, no run id and no map; a Skill step
in the text stays, by design. The map goes only to `<round>/owner/map.json`.

Each grades file is in skill-eval's score format, one block per criterion:

```text
Criterion 1: <criterion text>
  A: ?/5  <your reason>
  B: ?/5  <your reason>
```

Replace each `?/5` with a score from 1 to 5. A line left as `?/5` ends its block, so the lines after it would be lost;
`owner-grades` refuses until every letter has a score on every criterion.

## The round folder

Kept outside the repository, never committed. `round.json` there is the runner's state (format
`skills-bench-state/1`), which `run` resumes from. `labs/<task>/` is each skill-eval lab (plan, transcripts, key),
`blind/<task>/` each blind copy, `results/` the result files, `judge/` and `owner/` as above. Each task's run root is
its own `mktemp -d` outside the round, recorded in the state; RUNBOOK.md step B7 removes them.
