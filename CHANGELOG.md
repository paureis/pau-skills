# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-10-30: Q17 planned (decision 19)

- The owner kept every recommendation after Q16 (decision 19). Q17 measures how much the one-turn limit cost the
  first trigger round, then rewords the descriptions that still miss. `docs/backlog/q17.md` holds the plan, and
  `docs/backlog/kickoff.md` the message that starts the batch.

## 2026-10-29: Q16, trigger tests and a skill usage log

- `skill-eval` (verification 0.13.0) gets a trigger mode, `skill-eval.mjs triggers`: it runs every request of a folder
  of request lists as a one-turn headless run with all the skills under test installed, records the first skill the
  agent starts, and reports hits, misses, wrong starts, near misses and requests whose repeats disagree. It prints the
  estimate first (`--plan` spends nothing), keeps money in whole micro-dollars and stops before the cap. `TRIGGERS.md`
  documents it. A round also writes its summary in parts under the 20,000-byte limit, `split-summary` splits an
  older one, and `--baseline` takes a folder of parts.
- The first full round ran: 380 one-turn runs for 34.10 US dollars. No request started a wrong skill, every near miss
  came out right, and 175 of 228 runs started the skill they should; 41 of the 53 misses looked around the empty folder
  first. `evals/triggers/baseline/` holds its summary and `evals/triggers/baseline.md` what it showed.
- `evals/triggers/requests/` holds 5 requests for each of the 38 skills, written by an agent that never saw a
  description; `tests/trigger-lists.test.mjs` checks their shape.
- New hook `skill-usage` (session-discipline 0.13.0, pau-skills-hooks 0.4.0): one line per skill start (the time, the
  name, typed or by the agent, never the prompt) in `~/.claude/pau-skills/skill-usage.tsv`, trimmed past 1,000,000
  bytes. `which-skill` gets `usage-report.mjs`: starts per skill and the skills that never started in the last 30 days.
- The bundle goes to 0.17.0.

## 2026-10-26: Q16 planned (decision 18)

- The owner chose the next batch in a brainstorm and settled it in an interview (decision 18): Q16 adds a trigger mode
  to `skill-eval` with request lists for every skill here, and a `skill-usage` hook with a report in `which-skill`.
  `docs/backlog/q16.md` holds the plan, and `docs/backlog/kickoff.md` the message that starts the batch. The entries of
  2026-10-23 to 2026-10-25 moved to `docs/changelog/2026-W43-2.md`, since week 43 had ended.

## Older entries

Each earlier ISO week is in its own file in docs/changelog/, named `<year>-W<week>.md`; a week too large for one file
goes on in `<year>-W<week>-2.md`.

- [2026-W43, second part: 2026-10-23 to 2026-10-25](docs/changelog/2026-W43-2.md)
- [2026-W43: 2026-10-19 to 2026-10-22](docs/changelog/2026-W43.md)
- [2026-W42: 2026-10-12 to 2026-10-18](docs/changelog/2026-W42.md)
- [2026-W41: 2026-10-05 to 2026-10-11](docs/changelog/2026-W41.md)
- [2026-W40: 2026-09-28 to 2026-10-04](docs/changelog/2026-W40.md)
