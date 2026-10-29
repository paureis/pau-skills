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

Drop `--plan` to run it, and pass `--baseline evals/triggers/baseline.json` to see what got better or worse.
`baseline.json` is the summary of the first full round, and `baseline.md` says what it showed.
