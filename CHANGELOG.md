# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-10-25: after Q14, the owner's decisions (decision 17)

- The owner kept every recommendation: the project-setup eval keeps stopping a run whose output folder is inside the
  repository or under any CLAUDE.md, and nothing comes next for now, so the backlog stays empty.

## 2026-10-25: Q14 done; the backlog is empty

- Q14 is marked done in the backlog, with what worked and what did not in `docs/backlog/done.md` and the new
  `docs/backlog/things-that-bit/batch-12.md`. No skill or hook changed, so there were no zips, and the profile counts
  did not change. `docs/backlog/kickoff.md` says the backlog is empty and how to start the next batch.

## 2026-10-25: Q14, what Q13 left

- project-setup eval: `run.mjs` writes into a fresh folder under the system temp folder when `--out` is left out, and
  prints its path first. It refuses an output folder inside the repository, or one with a `CLAUDE.md`,
  `CLAUDE.local.md` or `.claude/CLAUDE.md` in it or in any parent folder, because Claude Code loads the CLAUDE.md of
  every parent folder. The printed cost and `summary.json` now count the assistant's, the persona's and the judge's
  calls: `costUsd` is the total and `costPartsUsd` keeps the three parts, each rounded once to cents from whole
  micro-dollars. `args()` refuses an option with no value. The helpers are in the new `out-folder.mjs`, and two new
  test files cover them without a model. No plugin changed (`evals/` is in no plugin), so nothing is bumped.

## 2026-10-25: Q15 done; Q14 next

- Q15 is marked done in the backlog, with what worked and what did not in `docs/backlog/done.md` and
  `docs/backlog/things-that-bit/batch-11.md`. The owner received `html-plan.zip` to upload. Q14 stays next, and its
  kickoff in `docs/backlog/kickoff.md` notes that Q15 is done. No skill or hook changed.

## 2026-10-25: Q15, html-plan pages that are easy on the eyes

- `scripts/pack-html-plan.mjs` builds `html-plan.zip` for upload to claude.ai from upstream html-plan at the pinned
  commit plus three additions in `scripts/html-plan/`: the Mist theme (a grey-blue page in light mode, light teal on
  dark in dark mode, and the page background painted in dark mode, where the artifact host had left it white), a fix
  for code excerpts that start on a blank line (numbered one line low before), and a Send to Claude button in the
  Respond sheet that posts the response as a comment through the artifact `comments` capability. The build refuses
  when an upstream anchor is missing or doubled, and no upstream file is kept here. The README lists html-plan under
  "Built from upstream, with additions"; NOTICE names the build; step 8 of the batch steps opens decisions pages at
  the decisions and declares the comments capability. No plugin changed, so nothing is bumped.

## 2026-10-25: after Q13, the owner's decisions (decision 16)

- The owner kept both recommendations: Q14 moves the eval's default output folder outside the repository and counts
  the persona's and the judge's costs. A new item, Q15, reworks the look of html-plan pages: in dark mode they showed
  light text on a white page, because the stylesheet paints `html` and the artifact host paints `body` white.

## 2026-10-24: Q13 and batch 11 done; Q14 and its kickoff

- Q13 and the eleventh batch are marked done in the backlog. Q14 holds the two findings on the owner's decisions page
  (the eval's default output folder inside the repository, and a printed cost without the persona and the judge),
  waiting on the answers (decision 16), and its kickoff is in `docs/backlog/kickoff.md`. The entries from 2026-10-17
  to 2026-10-19 moved from `docs/backlog/done.md` to `docs/backlog/done-2026-10-17-to-19.md`, so the file stays under
  20,000 bytes. No skill or hook changed.

## 2026-10-24: Q13, what Q12 left

- `evals/project-setup`: the persona's end rule comes first in its prompt and wins over the persona: once the
  assistant said it wrote the project CLAUDE.md and recommended a first task, the persona picked one, and an assistant
  message works on it, the persona replies `[END]` and takes no part in the task. The runner ends on a reply that holds
  `[END]` anywhere. The new `replay.mjs` sends a saved run, cut after a chosen turn, to the old or the new persona
  prompt n times and counts the replies that end. `spanish-beginner` passed 19/19 and ended at turn 20 of 40. The
  README says to pass `--out` outside the repository: inside it, every run also loads this repository's CLAUDE.md.
  No skill or hook changed, so nothing is bumped.

## 2026-10-24: after Q12, the owner's decisions (decision 15)

- The owner kept every recommendation: build Q13 (a stricter end rule for the project-setup eval persona), and leave
  the other skills that keep files outside the project, agent-friendly-audit's file size and the headless verify-app
  live pass as they are. The Q13 kickoff in `docs/backlog/kickoff.md` needs no pasted answers.

## 2026-10-24: Q12 and batch 10 done; Q13 and its kickoff

- Q12 and the tenth batch are marked done in the backlog, with what bit them in
  `docs/backlog/things-that-bit/batch-10.md`. Q13 holds the four findings on the owner's decisions page, waiting on
  the answers (decision 15), and its kickoff is in `docs/backlog/kickoff.md`. No skill or hook changed.

## 2026-10-24: Q12, what Q11 left

- `verify-app`: maintain mode keeps its run notes and any helper script it writes for itself in a git-ignored
  `.verify-app-notes/` folder at the project root, removed at the end of the pass that made it, instead of a scratch
  folder outside the repository, which a headless acceptEdits run refuses. The template and SKILL.md say why the run
  folder `$RUN` stays outside the project, and that a refused write there ends the pass as blocked: ask the user,
  never move the run.
- `agent-friendly-audit`: proofs and prototypes run in a git-ignored `.agent-audit-scratch/` folder inside the
  project, each copy its own repository with the check's files added, and the folder is removed before any run on
  the current code from the project root. Step 8 re-runs the proof on the uncommitted fix.
- `evals/project-setup`: `grade.mjs` runs its main block through a symlinked path (the realpath guard `run.mjs` has),
  and the default `--max-turns` is 40. The tests run both scripts directly and through a symlink.
- The changelog entries from 2026-10-19 to 2026-10-22 moved to `docs/changelog/2026-W43.md` before the week ended,
  to keep this file under 20,000 bytes.
- Versions: verification 0.12.2, planning 0.8.3, pau-skills 0.16.2. No hook changed. 1,304 tests.

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
