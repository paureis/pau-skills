---
name: skill-eval
description: "Check blind whether a change to a skill or prompt changes what an agent does: headless runs per variant, scored by a reviewer who does not know which is which; or test which skill starts for which request. Use when the user says 'A/B this prompt', asks whether a change to a skill or prompt helped, or asks whether the right skills start. Costs one agent run per variant or request per repeat."
argument-hint: "[the skill or prompt change to check] [--n <runs per variant, default 3>]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/eval.md
---

# Skill eval

The change to check: $ARGUMENTS

Run the same organic task several times with each variant of a skill or prompt, in folders where nothing tells the
agent it is being measured, then grade what each run actually did (the files it opened, the commands it ran, the
edits it made), never what it says it did. A reviewer scores every run in one pass without knowing which variant
produced which. You read every run too, blind, before the reviewer, and every disagreement between you is a finding.

Use it before you keep a change to a skill, a prompt or an instruction file, when the question is "does the agent
now behave differently". Do not use it for a change that cannot show up in what a run does (a typo, a reworded
description nobody sees), or when one careful read of a single run answers the question.

If you started this skill on your own, without the user typing its name or asking for what it does, first say in one
or two lines what it will do and what it will cost, and wait for a yes. A remark or a question that only matches its
description is not asking for it. If the user asked for it, or the brief you are working from does, go ahead.

Bundled files:
- `${CLAUDE_SKILL_DIR}/skill-eval.mjs`: `setup` makes the run folders and refuses a leak, `run` starts the headless
  sessions, `actions` reduces one transcript, `blind` makes the anonymous copies and the reviewer's input, `judge`
  runs the reviewer, `unblind` maps the letters back and lists the disagreements (Node 20+, no dependencies; run
  `node "${CLAUDE_SKILL_DIR}/skill-eval.mjs"` with no arguments for the usage)
- `${CLAUDE_SKILL_DIR}/JUDGE-BRIEF.md`: the reviewer's prompt; `blind` copies it into the reviewer's input
- `${CLAUDE_SKILL_DIR}/ISOLATION.md`: what a run sees and how it is kept clean; read it before Phase 1
- `${CLAUDE_SKILL_DIR}/skill-eval-triggers.mjs`: the `triggers` mode, started through `skill-eval.mjs`: one-turn runs
  that record which skill starts for each request, within a cost cap
- `${CLAUDE_SKILL_DIR}/TRIGGERS.md`: the `triggers` mode's request lists, counting and cost rules; read it before a
  trigger round

Make a task list with one entry per phase (Cost, Frame, Set up, Run, Read blind, Review, Unblind, Report) before
starting anything.

## Cost first

N is the number of runs per variant: 3 unless the user gave `--n`. Find the usage budget: the `LEAN_SUBAGENT_BUDGET`
environment variable (`echo "$LEAN_SUBAGENT_BUDGET"`), else `delegation.budget` in `.claude/review-rules.json`, else
`normal`. Before starting, always say the count: "This runs V variants x N = R headless agent sessions plus one
review, so about R + 1 times the cost of doing the task once, plus my reading of every run." When the budget is
`tight`, suggest N = 2. Never go below 2: with one run per variant, a difference can be the change or plain run to run
variation, and nothing tells them apart. Wait for the answer.

For scale: a dry run of a five step skill on an eight line text file, with `claude-sonnet-5-5`, cost 0.04 to 0.06
US dollars per run and 0.04 for the review, and the four runs took 17 seconds in parallel (October 2026). A real
task costs what doing it once costs, per run.

## What a run sees, and how it is kept clean

Read `${CLAUDE_SKILL_DIR}/ISOLATION.md` now, before Phase 1: what a headless run loads, and how `run` keeps it clean.

## Phase 1: Frame

1. **The variants.** Name each one and what differs: usually `before` (the current version) and `after` (the
   change), each a folder with a `SKILL.md`. Take the current version from git into a temporary folder, for example
   `git -C <repo> archive HEAD <path to the skill> | tar -x -C <tmp>`. Both must have the same `name`. To check a
   prompt change instead, use `none` for the skill and give each variant its own prompt file. `diff -r` the two
   folders and keep the diff for the report.
2. **The behaviour.** Say what a run with the change should do differently, in terms the transcript shows: a file
   it opens or writes, a command it runs, an edit it makes, a step it skips, or, for a skill whose output is the
   reply itself (an interview, a review, a plan written in the chat), what the reply says or asks. For such a skill
   the final message is the work product and is evidence: pass `--grade-reply` to `setup`, and the blind copies and
   the reviewer treat it so. Only when the change can show up neither in what a run does nor in what its reply says
   can this skill not measure it: say so and stop.
3. **The task.** A small project folder in which that behaviour would come up on its own: a project skeleton, the
   files the skill would read, a bug or a request that calls for it. Use names a user would pick. Leave out notes
   about the comparison, expected results and anything named after the rubric.
4. **The prompt.** What a user would type: it states the goal, not the purpose of the run. For a skill users type,
   it starts with `/<skill name>`. The same prompt goes to every variant unless the prompt is what changes. Never ask
   the run which skills, rules or files it used (that cues it to follow the chain), and never mention other runs.
5. **The rubric**, for the reviewer only: 3 to 6 criteria checkable from the actions and the diff (and the reply,
   with `--grade-reply`), specific to this task. At least one is the behaviour from step 2 and at least one is that
   the task itself still got done well (a change that adds the behaviour and breaks the work is not an improvement).
   Write the behaviour as a property of a good result that any run could have, not as a difference between
   versions: "the original was saved before notes.txt was first changed" names the behaviour; "the new backup rule
   was followed" or "the run did what the added step says" names the change. No criterion says which variant is
   which, that there are versions, or which one is new: a reviewer told what is new looks for it.

The words a run must never see, in the prompt, a folder or a file name: "eval", "test", "judge", "rubric",
"benchmark", "candidate", "experiment", "score", "compare" and "arena", in any form ("evaluate", "tests", "scoring").
`setup` checks this. When one of them belongs to the task itself (a testing skill, a project with a `tests/`
folder), pass `--allow-word <word>`; it is never allowed in the working folder's path. Words inside files only warn.

**Done when** you can name the variants, the behaviour, the task folder, the prompt and the rubric.

## Phase 2: Set up

```bash
LAB=$(mktemp -d)    # only you read this folder: the plan, the variants, the rubric, the transcripts and the key
ROOT=$(mktemp -d)   # new and empty: it will hold the run folders and nothing else
mkdir "$LAB/before" "$LAB/after"   # put the two skill folders here, or anywhere outside $ROOT
printf '%s\n' "<the prompt>" > "$LAB/prompt.txt"
node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" setup "$LAB" --root "$ROOT" --task <task folder> \
  --slug <project-name> --variant before="$LAB/before" --variant after="$LAB/after" --prompt "$LAB/prompt.txt" --n <N>
```

`setup` refuses, before writing anything: a meta word in a prompt, in the working folder's path or in a file or
folder name of the task or a variant; a link (or any special file) in the task or a variant, since a copied link
points back at the original and every run would share it; variants with different skill names; a typed prompt
(`/<name>`) for a variant with no skill; more than 26 runs; a root that is not new and empty, or that has Claude
Code files in it or above it; a lab, task, variant or prompt under the root. It copies the task and the variants
into `$LAB/source/`, then for each variant makes N folders, each a copy of the task (without `.git`) with that
variant in `.claude/skills/<name>/`, a fresh git repository with one commit by a neutral author, and an empty HOME
beside it. Runs get random four character ids and a shuffled order, so neither an id nor its place says which
variant it has. On a failure it removes what it made. It prints the run count: say it again if it differs from
what the user agreed.

Then write the rubric into `$LAB/rubric.md` (the template is there), with a `Task:` line that fits every variant.

**Done when** `setup` exited 0, every warning it printed is understood, and the rubric is written.

## Phase 3: Run

```bash
node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" run "$LAB" --model <model> --allow-tool 'Bash(cp *)' 'Bash(ls *)'
```

- `--model` is required. Headless runs default to a different model than this session; pass the one the skill is
  meant for (usually the model you run on) and record it.
- Every run uses `--permission-mode acceptEdits`, so it can edit files in its folder, and Claude Code lets read
  only commands such as `ls`, `cat` and `wc` through. Any other command needs an `--allow-tool` rule, one or several
  after the flag, as in `claude --allowedTools`: `'Bash(npm test)'`, `'Bash(pytest *)'`, `'Bash(go test ./...)'`,
  `'Bash(cargo test *)'`, `'Bash(git *)'`. A rule covers one command: `cp a b && sort a` is refused unless every
  part is allowed. A refused command shows up as a failed step, and a run blocked by permissions measures the
  permissions, not the skill. `Skill(<name>)` is added for you, since a skill with `allowed-tools` asks permission
  when it loads and `-p` cannot answer.
- The runs go in parallel (`--parallel <k>` to limit), each up to 30 minutes (`--timeout-min`). Transcripts are saved
  in `$LAB/runs/`, never in a run folder.

Read every line it prints, one per run by its random id: a run that did not finish, a warning that the skills a run
was offered do not match its variant (worded the same either way), and every refused tool call. A refusal that the
run worked around is noise to note; a refusal that stopped the work (a mistyped path, a command the task needs)
means the setup is wrong: fix it and run again with `--force`, which first rebuilds every run folder, HOME and
installed variant from `$LAB/source/`, so no run starts from what the last one left. To see a run's steps, use
`node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" actions "$LAB/runs/<id>.jsonl"`. A run that failed outright is a dropout;
with fewer than two runs left per variant, fix the cause and run again.

## Phase 4: Read blind

```bash
node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" blind "$LAB"
```

It checks the rubric (3 to 6 numbered criteria, no placeholder), then writes, in a new temporary folder, one file
per run under shuffled letters (`A.md`, `B.md`, ...): every tool call in order with what it touched and whether it
failed, the diff of everything the run changed since its first commit (the installed skill left out), the commits it
made, and last its own final message, marked as not evidence (or as the work product, with `--grade-reply`).
Files the task's `.gitignore` covers never show in the diff, so a section lists, by name, each ignored file a run
created, changed or deleted (build output, for example); read one yourself in the run folder after unblinding if it
matters. Paths are replaced with `<project>`, `<home>` and `<tmp>`. It also writes `bundle.md`, the reviewer's whole
input, and the key in `$LAB/key.json`.

Before `my-read.md` is written you may look at: what `run` printed (random ids, costs, refusals), the letter files,
and a transcript through `actions`, which shows nothing a letter file does not. You may not look at: `plan.json`,
`key.json`, `$LAB/source/`, or a run folder (its `.claude/skills/` holds the variant). If a refusal or a cost you saw
lets you tie a letter to an id, that still says nothing about the variant; only those four places do.

Read every letter file in full. Look for anything other than behaviour that would tell a reader which setup a run
had: a path or a variant name the setup leaked. Replace that with `[removed]` in `bundle.md`. Behaviour that happens
to give the variant away stays: a run that says "/brainstorm is not installed" because its variant names that skill,
or one that quotes its variant's own rule, is showing what the change does, and removing it would hide the result.
Note such a tell in the report. Then write `$LAB/my-read.md` in the reviewer's format, one block per criterion:

```
Criterion 1: <the criterion>
  A: 4/5  <evidence: a step number or a diff line>
  B: 2/5  <evidence>
```

A block holds only score lines and ends at the first other line; a score must be written as `n/5`. Below the
blocks, after a heading line such as `Notes:`, write two or three sentences per output, naming it "Output A", never
starting a line with "A:". `judge` refuses a read with a score line it cannot place.

## Phase 5: Review

```bash
node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" judge "$LAB" --model <model>
```

One reviewer scores every run, all variants, in one pass on one scale. It runs as `claude -p` with no tools at all,
no saved session, an empty HOME and an empty working folder, with `bundle.md` on standard input, so it can read only
what it is sent and never the key. It refuses until `my-read.md` has scores, newer than the key: a verdict read
first anchors your own.
Use the same model as the runs unless the user asked for another, and record it. The reply goes to
`$LAB/verdict.md`.

## Phase 6: Unblind and compare

```bash
node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" unblind "$LAB"
```

It refuses a `my-read.md` or `verdict.md` older than the key. It prints which letter was which run and variant,
the mean score per criterion per variant from the reviewer and from you, every score where the two of you are 2 or
more apart, and the total cost (from the `total_cost_usd` of each run and the review). `blind --force` makes new
letters only once `my-read.md` and `verdict.md` are moved out of the lab, since they score the old letters.

1. **Read the verdict in full**, not only the numbers: its flaws and patterns.
2. **Explain each disagreement.** Open that run's transcript (`node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" actions
   "$LAB/runs/<id>.jsonl"`) and decide: the reviewer misread, you misread, or the criterion has two fair readings.
   Each one goes in the report. Many disagreements on one criterion mean the rubric was unclear: say that the
   result on that criterion is unreliable.
3. **Count the behaviour.** For the behaviour from Frame step 2, count the runs per variant that show it in their
   actions or diff ("3 of 3 after runs copied the file first; 0 of 3 before runs did"). Counts say more than means
   at these sizes.
4. **Check the cost of the change**: the other criteria, the number of tool calls, the cost per run. A change that
   adds the behaviour and makes the work worse is a trade, not a win.
5. **Decide.** The change works when the behaviour separates the variants in your read and in the reviewer's, for
   most runs, with no criterion worse. The result is unclear when the counts overlap or you and the reviewer
   disagree on the behaviour: run more (N of 5, in a new lab folder) or sharpen the task so the behaviour has a
   clear chance to show.

Clean up: delete the root and the blind folder (`rm -rf "$ROOT" <blind folder>`). Keep `$LAB` while the user may
want the transcripts, and say where it is.

## Trigger tests

When the question is which skill starts for which request across a set of skills (hits, misses, wrong starts),
not what a change does to one skill's behaviour, use the `triggers` mode instead of the phases above. Read
`${CLAUDE_SKILL_DIR}/TRIGGERS.md` first: the list format, what a run sees, the counting and the cost rules. Keep the
request lists in a folder outside the skill folders. Make a new lab folder with `mktemp -d` and write its path
literally. Run with `--plan`, tell the user the run count and the estimate it prints, and wait for a yes; then run
the same line without `--plan`. A run starts only when what was spent, plus twice the price for each run in flight
and for itself, stays within `--max-usd`, so the round stops before it can pass the cap.

```bash
node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" triggers <lab folder> --skills <skills folder> [--also <folder>]... \
  --requests <lists folder> --model <model> --max-usd <cap> [--repeats 2] [--usd-per-run 0.08] [--parallel 3] \
  [--baseline <older summary.json>] [--pass-env <NAME>...] [--real-home] [--timeout-min 5] --plan
```

## Do not

- Put a meta word where a run can see it, ask a run which skills or files it used, or tell it other runs exist.
- Grade from a run's final message. The actions and the diff are the evidence.
- Give the reviewer the plan, the key, the variants, the diff between them or your opinion.
- Open `key.json` or `plan.json` before `my-read.md` is written.
- Run with your real HOME, or as subagents of this session, and call the comparison clean.
- Run a single run per variant, or average away a disagreement instead of explaining it.

## Report

```
Variant under test: <skill or prompt, and what changed: before vs after, from the diff>
Runs: <V> variants x <N> + 1 review   Models: runs <model>, reviewer <model>   Cost: $<total>
Isolation: <what each run saw: its variant plus built-in skills; empty HOME or --real-home; overlap with a built-in
  skill, or none; tells in the behaviour; turns not seen; dropouts>
Rubric:
  1. <criterion>
  ...
Per run:
  A (<variant>, <run id>): <what it did, from its actions and diff; its most serious flaw>
  ...
Reviewer's verdict: <means per variant per criterion; its main finding>
My read: <means per variant per criterion>   Disagreements: <each one and what it turned out to be, or none>
Synthesis: <what the change did to behaviour, with counts; what it cost>
Recommendation: <keep the change | do not keep it | run again with <what changes>>, because <...>
Lab folder: <path>
```
