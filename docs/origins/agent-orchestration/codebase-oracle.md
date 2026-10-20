# codebase-oracle (Adapted from [pstack `how`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/how) and [`why`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/why))

Back to the [origins index](../../ORIGINS.md).

Written as an Original skill: 0 of 1215 word 6-grams appeared in any upstream version. This version takes the evidence
tiers from pstack's `why` (`skills/why/references/epistemics.md`) and the explorer and explainer pattern from pstack's
`how` (`skills/how`). 58 of the 4,847 distinct word 6-grams in `SKILL.md`, `TIERS.md`, `EXPLORER-BRIEF.md` and
`EXPLAINER-BRIEF.md` appear in those upstream files: 40 in `how` and 18 in `why`.

**Problem.** Planning and grilling sessions produce lists of questions about the code ("does the middleware already
handle X?"), and a model answering from framework knowledge guesses plausibly and wrongly. The oracle answers only from
evidence: the code for what it does, the commit and pull request record for why. It labels how strong the evidence is
for every answer and never presents a guess as a finding.

**Changes for the first release.** None.

**What this version changes (2026-10-17)**, from a `git diff --no-index` against each upstream file:
- From epistemics.md: the five tiers (direct, supported, inferred, speculative, unknown) and the wording each allows;
  confidence words that need a citation next to them; never treating code as evidence for its own intent; the user's
  guess as one candidate among others; showing both sides when sources disagree; absence of evidence is not evidence;
  no tidy reasons fitted to messy history. The tiers live in a bundled `TIERS.md` that is pasted whole into each
  subagent brief. Upstream's tiers cover intent only. Here they also cover behaviour: code read along the whole path,
  or a run, is direct, and a thorough search that proves something is absent is direct. Upstream's output sections
  (What We Found, Competing Hypotheses and the rest) and its list of words to avoid are not taken; the oracle keeps its
  per-question format and adds Tier and Other candidates lines.
- Added here, not upstream: a stated reason must be about the exact thing asked; a documented link you cannot see is
  Inferred; documentation of a process is a claim about what people do; platform knowledge is Speculative until vendor
  docs or an experiment settle it; intent is Unknown only after the record lookup; an API error is not evidence; the
  tier count is of labels in the finished text.
- From how/SKILL.md and its two reference prompts: 2 to 4 explorers on separate angles, launched together, then one
  explanation in the format Overview, Key concepts, How it works, Where things live, Gotchas. The explorer report
  sections (Components, Flow, Boundaries, non-obvious things as Gotchas, Files read, Open questions) and parts of the
  explainer's instructions come across. Cursor's `Task` with model slugs from a rules file becomes the Agent tool: the
  `Explore` type where it exists, with its `model` field to raise a deep angle, and no model named. Upstream's simple
  path, one explainer subagent, becomes the existing single-agent flow. Every claim carries a tier and the summary
  counts them. Each question in a list is classified on its own; the cost line is the first step; with no Agent or Task
  tool the angles run in sequence; an explainer's tier may be lowered, never raised; a section is dropped only when it
  would be empty.
- From why/SKILL.md and why/references/sources/code-archaeology.md: the git commands (log --follow, -S, -G, blame -L,
  show) and reading pull request numbers from merge or squash commit subjects. `gh pr view --json` becomes the GitHub
  MCP tools or `gh api` REST routes (pulls/<n>, pulls/<n>/reviews, pulls/<n>/comments, issues/<n>/comments,
  commits/<sha>/pulls, with `--paginate`), because `gh pr view` needs GraphQL, which some environments block. New: what
  to do when the record cannot be reached, and shallow clones.
- Not taken: why's MCP discovery, the seven investigators (one per evidence category), the synthesizer and the
  Preserve / Change / Avoid / Risk list.
- The description now reads "from code and history, grading the evidence for each answer" instead of "from the code
  itself, with verified evidence for each answer". It is 348 characters, one fewer than before.

**Why.** Backlog item M7. A cold run with real explorers on this repository, in two headless sessions, found that the
cheaper model kept a big question on the single-agent path and called an intent question Unknown without looking at
the pull request record, and that the explorer brief invited trimming the tiers; the rules on classifying each
question, on Unknown, and the separate `TIERS.md` came from it.
