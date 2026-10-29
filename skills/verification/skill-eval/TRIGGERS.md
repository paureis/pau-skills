# Skill eval: trigger tests

Names such as `run` and `actions`, and `${CLAUDE_SKILL_DIR}`, mean what SKILL.md says (this folder).

## What it answers

`triggers` answers "does the right skill start for the right request, and does a wrong one stay quiet?" for a set
of skills. It sends each request of a set of request lists to a one-turn headless `claude -p`, records the first
skill the agent started (or none), and counts per skill:

- **hits**: requests that should start the skill, and did;
- **misses**: requests that should start it, and started another skill or none (each miss names what started, and
  the first tool used when nothing started);
- **wrong starts**: requests meant for another skill, or for none, that started it.

It also counts the near misses that went right and wrong, flags each request whose repeats did not all start the
same thing (unsteady), and compares the round with an earlier one.

Use it after you write or change a skill's description, to check that a whole set of skills still splits requests
the way you meant. It measures which skill starts, not how well the skill then does its job; for that, use the
blind comparison in SKILL.md.

## The request lists

One JSON file per skill in the `--requests` folder; every `*.json` file directly in it is a list, and other files
are ignored. A list names a skill under test, the requests that should start it, and near misses: requests that
look close but should start another installed skill, or nothing (`"none"`).

```json
{
  "skill": "tidy-notes",
  "should": ["tidy my shopping notes", "my list has the same item three times"],
  "nearMisses": [
    { "request": "pack the kitchen boxes for Friday", "expect": "pack-boxes" },
    { "request": "what time is it in Lisbon", "expect": "none" }
  ]
}
```

Any number of each, at least one request in all. Write requests the way a user would type them, on one line. The
command refuses, naming the file: a file that does not have this shape; a skill that is not under test; two lists
for one skill; an `expect` that is neither an installed skill nor `"none"`; a near miss that expects its own list's
skill; a file over 1,000,000 bytes. For a request it also names where it is (`should 2`, `nearMisses 1`): an empty
request, one with a control character (a line break, a tab, NUL and the like), one over 2,000 characters, and one
that starts with `/` (a typed `/name` never goes through the Skill tool, so it cannot show a trigger) or with `-` (it
would read as an option). A folder with no list is refused too. A skill under test with no list is fine: it is
installed and can still collect wrong starts. Keep the lists outside the skill folders, so they are not installed
with the skills.

## The skills

Every `SKILL.md` below each `--skills` folder is a skill under test; every one below an `--also` folder is installed
beside them and never has a list. Discovery does not look inside a folder that has a `SKILL.md`, skips dot folders
and `node_modules`, and follows a link to a folder, as Claude Code does for a linked skill folder. The name comes
from the frontmatter, and the skill is installed under that name, whatever its folder is called. A `SKILL.md` with no name, a name that is not lower
case letters, digits and `-`, the same name twice, and a folder that does not exist (or holds no skill) are refused.

## What a run sees

Each run gets a fresh folder of its own: `<root>/tmp.XXXXXX/project`, with every skill under test and every
`--also` skill copied into the project's `.claude/skills/<name>/` (the real files, also behind a link, without
`.git`), and an empty HOME beside it. The skills go in the
project and not under HOME because `--setting-sources project` hides skills under HOME. The run also sees Claude
Code's built-in skills (`verify`, `debug`, `code-review` and the rest), which compete with yours like any other skill.

Like `run`, every run has an empty HOME, only the project's settings, no MCP server (`--strict-mcp-config`), no saved
session, and an environment built from the allowlist plus the names you pass with `--pass-env`. ISOLATION.md
explains the allowlist, the login check, `--pass-env` and `--real-home` (your HOME, with the same flags; a weaker
isolation to name in the report). The run folders are not git repositories, and the transcripts are written to
`<lab>/runs/<id>.jsonl`, never into a run folder. The root is made in the temporary folder (set `TMPDIR` to move
it); it is refused when it has a `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` or `.claude` in it or above it, when it
lies inside a git work tree (`git rev-parse --show-toplevel` succeeds in it, so a run's git commands would reach
that repository), or when the run folders' path holds a word that tells a run it is measured. Each run's folder is
removed when the run ends, and the root once every run has ended, also when a run fails.

A run whose folder, copy or start fails is a failed run with a note; the round goes on, and summary.json and the
report are still written.

Checked on a real run (Claude Code 2.1.312, October 2026, 380 runs): in a folder that is not a git repository, every
project skill is listed in the init line and a start comes back as `Skill {"skill":"<name>"}` with its bare name. With
`--max-turns 1` the call is printed, then the run ends with the subtype `error_max_turns` and a `total_cost_usd`. A
skill with `allowed-tools` is refused permission in `-p`, but its call is still printed, so it still counts as started.
One run cost 0.08 to 0.10 US dollars with 38 skills installed.

The arguments of every run are exactly:

```
claude -p <request> --max-turns 1 --output-format stream-json --verbose --model <model> --setting-sources project
  --strict-mcp-config --no-session-persistence --max-budget-usd <hard stop>
```

Nothing else: `--bare` accepts only an API key, and `--disable-slash-commands` turns off every skill.

## One turn

A run has one turn. When the agent's first move is a Skill call, the run records that skill. When it first looks
around (a Read, an `ls`, a search) it may well have started the skill in its second turn, which the run never sees.
So a miss that started nothing is split in two: "answered or did nothing" (no tool at all) and "looked first" (a
tool, counted by name). Many "looked first" misses mean the one-turn limit costs that skill; many "answered" ones
mean the description did not reach the agent.

## How a run is counted

- **What started** is the `skill` of the main agent's first Skill call: a call made by a subagent does not count. It
  is compared by the part after its last colon, so a plugin or uploaded skill that comes back as
  `moving-kit:pack-boxes` counts as `pack-boxes`. No Skill call, or one without a skill name, is "none".
- A built-in skill counts as another skill, by name: a should request that started `verify` is a miss, and `verify`
  gets a wrong start.
- A should run is meant for its list's skill; a near miss is meant for its `expect`. A run that started a skill other
  than the one it was meant for is a wrong start for the skill it started.
- A near miss is right when its `expect` started, or when nothing started (nothing starting is never a misfire).
- A request is unsteady when its repeats did not all start the same thing.
- A run with no result line failed. A failed run that started nothing, and a run not made, are left out of every
  count; a failed run that started a skill before it stopped still counts. A run that exits nonzero with a result
  line (one turn can end with `error_max_turns`) is noted, not failed.
- A run gets a note when it has no result line, exits nonzero, or its first line lists skills without one of the
  installed ones.

## Cost

Every run costs real money. The cost rules:

- **The estimate** is runs x `--usd-per-run` (default 0.08 US dollars, the cost of a one-turn run measured when the
  mode was planned). Runs are every request times `--repeats` (default 2).
- **`--plan` first.** It prints the skills, the requests, the repeats, the runs, the estimate and the cap, and stops:
  no run, no login check, no root, nothing written. It checks the skills, the lists, the baseline, and that the lab
  folder holds no summary.json and is not inside an input folder. Tell the user the run count and the estimate, and
  wait for a yes before the round without `--plan`.
- **The price** is the highest real cost of a run seen so far, never lowered, and at least `--usd-per-run`.
- **The hard stop** of a run is twice the price when it starts, passed as `--max-budget-usd`.
- **The cap** (`--max-usd`, required) refuses, before any call, a round whose estimate passes it (raise the cap or
  lower `--repeats`) and a cap below one hard stop. During the round, a run starts only when what was spent, plus the
  hard stops of the runs in flight, plus its own hard stop, is at most the cap. So the round stops before it can
  pass the cap. When the next run does not fit, the round waits for a run in flight to end and checks again; with
  none in flight it stops, and the rest are "not run (cap)". Only one run starts until the first real cost is known.
  Leave room above the estimate, about one hard stop per parallel run, or the round ends before its last runs.
- **What a run costs**: the cost on its result line; its hard stop when it started claude and printed no cost;
  nothing when claude never started. If a run still costs more than its hard stop and the round ends above the cap,
  the report says by how much and the round exits 1.
- **Parallel runs** default to 3 (`--parallel`, 1 to 10), to stay under rate limits. Each run may take up to
  `--timeout-min` minutes (default 5).
- Money is held as whole micro-dollars and printed in dollars and cents, rounded once, half up. `--max-usd` and
  `--usd-per-run` take a number with at most 6 decimals.

## The skill listing budget

With many skills installed, Claude Code may shorten or drop skill descriptions from what the agent sees, and a skill
whose description was dropped cannot be picked. Each run's first transcript line lists the skills it was offered;
a run whose list lacks an installed skill gets a note. To raise the budget, set `SLASH_COMMAND_TOOL_CHAR_BUDGET` and
pass it with `--pass-env SLASH_COMMAND_TOOL_CHAR_BUDGET`.

## summary.json

Written to `<lab>/summary.json` after the round. A lab folder that already holds one is refused.

- `format`: 1. `model`, `repeats`, `at` (ISO time), `skills` (under test), `also`, `parallel`, `realHome`.
- `currency`: `USD`, for every amount below. `capMicros`, `usdPerRunMicros`, `estimateMicros`, `costMicros` (spent,
  counted as in the cost rules), `runsPlanned`, `runsMade`. All money in micro-dollars (1 US dollar is 1,000,000).
- `runs`: one entry per planned run, in plan order: `id` (list, kind, index and repeat, as `tidy-notes-s1-r2` or
  `tidy-notes-n2-r1`), `list`, `kind` (`should` or `nearMiss`), `index`, `repeat`, `request`, `expect`, `started`
  (a bare name, `none`, or `null` for a run not made), `firstTool`, `costMicros`, `result` (the result line's
  subtype, `no result line`, `failed before claude started`, or `not run (cap)`), `finished`, `spawned` (whether
  claude started) and `notes`.
- `perSkill`: for every skill with a list or a start, built-ins included: `hits`, `shouldRuns`, `misses` (each with
  `id`, `request`, `started` and `firstTool`) and `wrongStarts` (each with `id`, `list`, `kind`, `request` and
  `meantFor`).
- `nearMisses`: `right`, `total`, and `wrong` (each with `id`, `list`, `request`, `expect` and `started`).
- `unsteady`: each request whose runs differ, with `list`, `kind`, `index`, `request` and the names that started.
- `missKinds`: over the should runs that started nothing, `answered`, `lookedFirst`, and `byTool` (the count per
  first tool).

The command prints a report from it: the cost line (and how far above the cap, if it ended there), one line per
skill, the wrong near misses, the unsteady requests, the miss kinds, each run's notes and the runs not made. It exits
0 when every planned run ran and finished within the cap, 1 when the round stopped at the cap, ended above it, a run
failed, or the round was refused, and 2 on a usage error.

## Comparing with an earlier round

`--baseline <older summary.json>` checks the file before any call (it must exist and hold `"format": 1`), and after
the report prints what got better or worse: per skill, hits and wrong starts that went up or down; per request
(matched by list, kind and request text), a change in the share of its runs that were right (a should run that
started its list's skill, or a right near miss); and the requests that are new or gone. Compare rounds made with the
same model and repeats.

## Reading one run

To see what a run did, pass its transcript to `actions`:
`node "${CLAUDE_SKILL_DIR}/skill-eval.mjs" actions <lab>/runs/<id>.jsonl`.
