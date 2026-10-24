# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-10-24: after Q11, the owner's decisions (decision 14)

- The owner kept every recommendation: build Q12 (two skills' scratch folders outside the project, two eval gaps),
  and leave project-setup's two refused calls and launch-readiness's up-front area reads as they are. The four Q11
  zips are uploaded and synced. The Q12 kickoff in `docs/backlog/kickoff.md` needs no pasted answers.

## 2026-10-23: Q11, what batch 8 left

- `project-setup` reads its own STYLE, QUESTIONS and PRODUCTION-RULES files, sends its introduction alone, ends it
  with "Shall I start?" and reads the project only after the answer. Each production rule in CLAUDE.md starts with
  its bold name. The eval grader checks both, and two scenarios run on the launch-readiness fixtures.
- Rule 2 of the production rules (four copies): look up a key from input in a set the code defines only in a fixed
  list or a map type, and reject a missing key. SEC-06 checks it. The geppetto roster goes to version 4.
- `launch-readiness` reads its area files before the profile stop, so a grade after `--resume` completes; a refused
  read leaves a blocking `<prefix>-NA` row.
- `geppetto` Create and Update check drafts in `.geppetto-draft/` inside the project.
- Versions: session-discipline 0.12.1, verification 0.12.1, agent-orchestration 0.11.1, guards 0.9.1, pau-skills
  0.16.1. No hook changed. 1,298 tests.
- Q11 and batch 9 are marked done in the backlog, with what bit them; Q12 holds what Q11 left, waiting on the
  owner's answers (decision 14), and its kickoff is in `docs/backlog/kickoff.md`.

## 2026-10-23: the eighth batch, Q3 designer agent and Q8 production rules from day one

- Q8: `PRODUCTION-RULES.md` holds five production rules (money, server input, queries, the signed-in user, secrets),
  each a condition and an instruction, with the signals that make each apply, the `launch-readiness` checks each
  prevents and the checkers per ecosystem. `launch-readiness` keeps the source; `project-setup`, `rule-to-hook`
  and `geppetto` carry identical copies (in `COPIES`), and `tests/production-rules.test.mjs` fails when a cited
  check id leaves the area files.
- `project-setup` asks a new Q8 on the full path that offers only the rules whose signal the project shows (one
  bullet of short sentences per rule, every instruction kept), adds them as listed defaults on the quick path, and
  renumbers the old Q8 to Q12 as Q9 to Q13. It works out the question count before the first question, and its
  introduction rule is stated more strongly (a cold run showed it still opens with findings; see the pull request).
- `rule-to-hook` starts a production rule from the checker its table names (one rule per run); `launch-readiness`
  offers the matching rule when it closes a gap.
- `geppetto`: `builder` and `reviewer` carry the production rules block, and `reviewer` reports a break of one as
  a defect; `check-agents.mjs` checks the block when an agent has one; the roster goes to version 3 (installed here).
  Create can make a `designer` from `templates/designer.md`: it extends a design system in code from one keyframe
  with only its tokens and lists every value it invents. Update never merges against the template and keeps the
  `skills:` line Install added. A fixture design system is in `tests/fixtures/geppetto-designer/`. 1,285 tests.
- Versions: session-discipline 0.12.0, verification 0.12.0, agent-orchestration 0.11.0, guards 0.9.0, pau-skills
  0.16.0. No hook changed.
- Q3, Q8 and batch 8 are marked done in the backlog, with what bit them; Q11 holds what batch 8 left, and its
  kickoff is in `docs/backlog/kickoff.md`.
- Decision 13: the owner kept every batch 8 recommendation, so Q11 builds project-setup's introduction stop, the
  rule 2 lookup clause and the headless gaps; the check ids stay in the table.

## Older entries

Each earlier ISO week is in its own file in docs/changelog/, named `<year>-W<week>.md`.

- [2026-W43: 2026-10-19 to 2026-10-22 so far](docs/changelog/2026-W43.md)
- [2026-W42: 2026-10-12 to 2026-10-18](docs/changelog/2026-W42.md)
- [2026-W41: 2026-10-05 to 2026-10-11](docs/changelog/2026-W41.md)
- [2026-W40: 2026-09-28 to 2026-10-04](docs/changelog/2026-W40.md)
