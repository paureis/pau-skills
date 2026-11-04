# Trigger request lists

`requests/<skill>.json` holds, for every skill in this repository, 3 requests that should start it and 2 near misses,
each naming the skill (or `none`) that should start instead. Request 1 is a phrase quoted in the skill's description;
requests 2 and 3 and the near misses were written by an agent that never saw a description, from the skill bodies and
the README's problem lists, so they cannot copy the description's wording. `tests/trigger-lists.test.mjs` checks their
shape on every `npm test`; CI never runs a model.

A round runs each request as a one-turn headless `claude -p` with all 38 skills installed, through `skill-eval`'s
trigger mode (see `skills/verification/skill-eval/TRIGGERS.md`). Run it from a folder outside this repository, so no
run reads this repository's `CLAUDE.md`:

```bash
LAB=$(mktemp -d)
node skills/verification/skill-eval/skill-eval.mjs triggers "$LAB/round" --skills skills --requests evals/triggers/requests \
  --model <model> --max-usd 40 --plan
```

Drop `--plan` to run it, and pass `--baseline evals/triggers/baseline` to see what got better or worse. `baseline/`
holds the summary of the first full round in parts (one per list, and `round.json`), each under the 20,000-byte limit,
and `baseline.md` says what the round showed.

`two-turn/requests/` holds the 41 should runs of the baseline that ran a tool first and started nothing ("looked
first"), one list per skill that had such a miss; a request that missed in both repeats is listed twice.
`tests/trigger-lists-two-turn.test.mjs` checks them against `baseline/`. They are rerun once each with two turns, to
tell the one-turn limit from a weak description. As for the full round, run it from the repository root with `TMPDIR`
set to a folder outside every repository (the mode refuses a run root inside a git work tree):

```bash
LAB=$(mktemp -d)
node skills/verification/skill-eval/skill-eval.mjs triggers "$LAB/round" --skills skills --requests evals/triggers/two-turn/requests \
  --model <model> --max-turns 2 --repeats 1 --usd-per-run 0.12 --max-usd 7 --plan
```
