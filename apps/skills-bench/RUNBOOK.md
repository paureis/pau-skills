# Skills Bench runbook: the pilot round

The main session's steps for the Q45 pilot, B0 to B7, every command run from the repository root. FORMAT.md has the
formats; `node apps/skills-bench/bench.mjs` with no arguments prints the usage. Money on the command line is US
dollars with at most 6 decimals; in the files it is whole micro-dollars.

Rules for every step: never print, store or pass on an API key or any environment value; keep every round folder
outside the repository (the runner refuses one inside it); a model is called only from B2 on.

## B0: plan and an offline smoke round (free)

Plan with the real tasks:

```bash
node apps/skills-bench/bench.mjs plan --config apps/skills-bench/pilot.json --model claude-sonnet-5-5
```

Expect `Runs: 72`, `Judge calls: 10`, `Estimate: $27.30` and `Cap: $40.00`. The `Start-rule factor` line says how far
every price can grow while the start rule still lets every task start in order (about 1.41 for the planned tasks).
A refusal or a `warning:` line about the task counts means a task is missing or breaks contract 1.

A smoke round with the fake claude, which calls no model:

```bash
S=$(mktemp -d)
export SKILL_EVAL_CLAUDE="$PWD/tests/fixtures/skills-bench/runner/fake-claude.mjs"
node apps/skills-bench/bench.mjs run --config apps/skills-bench/pilot.json --model fake-model --round "$S/round" --max-usd 40 --n 1
node apps/skills-bench/bench.mjs judge --round "$S/round" --judge-model fake-judge
node apps/skills-bench/bench.mjs owner-sheet --round "$S/round" --out "$S/sheet"
node apps/skills-bench/bench.mjs export --round "$S/round" --to "$S/out" --auth unknown
unset SKILL_EVAL_CLAUDE
```

Every task should end `done`, the sheet should hold 10 letters and export should exit 0. The fake does not know the
real skills' variants, so its grades mean nothing; the step checks that every part runs. Remove the smoke round's run
roots as in B7, then `rm -rf "$S"`.

## B1: the login and the cap

```bash
export ANTHROPIC_API_KEY=placeholder
```

The network proxy injects the real key; the variable only has to exist. Never print it. Pass
`--pass-env ANTHROPIC_API_KEY` to every `run` and `judge` below, so it reaches the runs and the judge and nothing
else does.

Check the login under an empty HOME, by exit code only:

```bash
H=$(mktemp -d); HOME="$H" claude auth status > /dev/null 2>&1; echo "exit $?"; rm -rf "$H"
```

Exit 0 is logged in. skill-eval checks the same before any run and refuses without spending. The owner confirms the
cap (pilot.json says $40) before B2.

## B2: calibration

One complex bug-fix task, one run per variant, in its own round:

```bash
C=$(mktemp -d)
node apps/skills-bench/bench.mjs run --config apps/skills-bench/pilot.json --model claude-sonnet-5-5 --round "$C/round" --max-usd <cap> --only <the complex bug-fix task id> --n 1 --pass-env ANTHROPIC_API_KEY
```

The round is flagged `calibration: true`. Read what it spent and its highest run cost:

```bash
node -e "const s=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const d=(m)=>Math.floor(m/1e6)+'.'+String(m%1e6).padStart(6,'0');console.log('spent',d(s.spentMicros),'highest complex run',d(s.seenMicros.complex||0))" "$C/round/round.json"
```

Plan again with that price and what is left of the cap:

```bash
node apps/skills-bench/bench.mjs plan --config apps/skills-bench/pilot.json --model claude-sonnet-5-5 --max-usd <cap minus spent> --price complex=<highest complex run>
```

A price below the pilot.json default changes nothing: a price is the highest of the default, `--price` and the
highest cost seen in the round.

## B3: the full round

```bash
F=$(mktemp -d)
node apps/skills-bench/bench.mjs run --config apps/skills-bench/pilot.json --model claude-sonnet-5-5 --round "$F/round" --max-usd <cap minus spent in B2> --price complex=<from B2> --pass-env ANTHROPIC_API_KEY
```

A task starts only when what is spent, its runs at their hard stop (2 x the price of its difficulty) and the judge
reserve stay within the cap; otherwise it is `not run (cap)` and the next one is tried. A run that leaves no result
line is charged its hard stop. Note: claude checks `--max-budget-usd` after a call, so one run can pass its stop.

If the round stops (a crash, a closed session), run the same command again: it skips the tasks that are done and
collects an interrupted task's runs. Use the same `--model`, `--n` and `--only`.

## B4: the judge

```bash
node apps/skills-bench/bench.mjs judge --round "$F/round" --judge-model claude-sonnet-5-5 --pass-env ANTHROPIC_API_KEY
```

One blind judge per task, with no tools, an empty HOME and an empty working folder. Its cost counts against the cap
of the round. Run it again to retry a task whose judge failed.

## B5: the owner's grades

```bash
node apps/skills-bench/bench.mjs owner-sheet --round "$F/round" --out "$F/sheet"
```

Lay the sheet out on one html-plan page: A.txt to J.txt, the two rubrics and the two grades files, as plain text.
Never show `$F/round/owner/map.json`. The owner grades blind, filling every `?/5`. Save the two grades files, then:

```bash
node apps/skills-bench/bench.mjs owner-grades --round "$F/round" --tdd <grades-tdd.txt> --bug-fix <grades-bug-fix.txt>
```

It refuses until every letter has a 1 to 5 score on every criterion, and names what is missing.

## B6: export (the results slice)

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).roundId)" "$F/round/round.json"
node apps/skills-bench/bench.mjs export --round "$F/round" --to apps/skills-bench/results/<round-id> --auth api-key
```

Export the calibration round the same way into its own `results/<round-id>`, if it is kept. Then run the checks:
`npm test`, `npm run scrub`, `node scripts/build-marketplace.mjs --check`, `claude plugin validate . --strict`.

## B7: clean up after the merge

Remove each round's labs and run roots once the results are merged:

```bash
for R in "$C/round" "$F/round"; do
  node -e "const s=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));for(const t of Object.values(s.tasks))if(t.root)console.log(t.root)" "$R/round.json" | while read -r d; do rm -rf "$d"; done
done
rm -rf "$C" "$F"
```
