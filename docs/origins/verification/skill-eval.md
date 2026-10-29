# skill-eval and `skill-eval.mjs` (Adapted from [pstack eval playbook](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode/playbooks/eval.md))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/poteto-mode/playbooks/eval.md`. Local models: `evals/project-setup/` (`run.mjs`, `grade.mjs`,
`JUDGE.md`) and this repository's `arena`. `SKILL.md` shares under 1% of its word 6-grams with `eval.md`; what comes
from upstream is structure: the blinding rules (no meta words, an organic prompt, no chain-eliciting cues, sanitized
names, runs that do not know of each other, one judge for both variants in one pass), the order of the steps, the 3 to
6 criteria rubric and the reply fields. `JUDGE-BRIEF.md` and `skill-eval.mjs` are mine; the script adapts small helpers
from `arena.mjs` and `run.mjs`.

**Problem.** A change to a skill reads better, but nobody knows whether the agent behaves differently. An author who
grades their own change sees what they hoped. A run that can tell it is being measured, or that finds a second copy of
the skill, measures the wrong thing.

**What this version changes.**
- Cursor `Task` candidates become headless `claude -p --output-format stream-json` runs. Subagents are not used: they
  inherit the session's skills and return no transcript.
- An isolation recipe found on Claude Code 2.1.302: an empty HOME, `--setting-sources project`, `--strict-mcp-config`,
  and an environment built from an allowlist (a run otherwise inherits the session's identity). The built-in skills
  remain and are named as a confound.
- `skill-eval.mjs` does the steps an agent gets wrong: it refuses meta words in the prompt, the path and file names
  (and warns on contents); refuses a root that is not new and empty, or that sits under an instruction file; makes
  neutral folders with a fresh repository each; reduces each transcript to what the run did; builds the blind copy from
  those actions and the diff, with the installed skill left out, paths replaced and the order shuffled; runs a reviewer
  with no tools on standard input; and unblinds with per-variant means and every disagreement.
- The "different model family" judge becomes a fresh `claude -p` reviewer with a hostile brief. The orchestrator
  scores blind first, and the script refuses to start the reviewer until it has.
- Runs get random ids in a shuffled order, so nothing printed before the orchestrator's own read gives the variants
  away; `run --force` rebuilds every run folder from the lab's pristine copies; scores use one strict `n/5` format.
- The login is checked under the empty HOME before any run; `--real-home` is the fallback, and `ISOLATION.md` says what it
  loses. Windows is refused for the real command rather than quoted half right.
- `--grade-reply` covers a skill whose reply is the work product (an interview skill such as `grill-me`), and the
  report says that a headless run shows only the first turn.
- Cost first, with the budget variable; at least 2 runs per variant.
- The meta-word list adds upstream's experiment, score, compare and arena to the backlog's words.

**Why.** In the dry run a long path made a run mistype its own folder, the rubric's guidance would have told the
reviewer about "variants", and the session id leaked through an environment variable. The review round found that run
ids in variant order let the orchestrator's own read see the variants, and that a rerun started from the previous
run's edits.

**The trigger mode (Q16, original).** `skill-eval-triggers.mjs`, `skill-eval-triggers-count.mjs` and `TRIGGERS.md`
have no upstream. The owner asked for proof that the skills start for the right requests and stay quiet for the wrong
ones. The mode reuses the run setup above (the empty HOME, the allowlisted environment, `--setting-sources project`),
installs every skill under test in a fresh folder per run, runs each request for one turn and records the first skill
the agent starts. The money rules come from production rule 1: whole micro-dollars, one rounding, and a cap that
reserves each running run's hard stop, after the review showed a cap that reserved only the price could end at 1.76
US dollars of a 1.00 cap.
