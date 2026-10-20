# P1. Small tooling ideas

[Back to the backlog index](../BACKLOG.md)

- **P1.1 pack-skills** (`done`). The owner gets every skill through the claude.ai account (Customize, Skills, Upload
  a skill), so each changed skill has to be re-uploaded as a zip of its folder. A `scripts/pack-skills.mjs` (Node
  standard library; zip written with `zlib.deflateRawSync` and a small central directory) that writes
  `dist/<skill>.zip` for named skills, or for every skill changed since a git ref, would make that one command. Check
  the upload rules claude.ai enforces before writing: no XML-like tag in a description, no "claude" or "anthropic" in
  a name (both already tested).
- **P1.2 validate in CI** (`done`, fourth batch). `claude plugin validate . --strict` runs only locally; add it to the CI workflow
  (`.github/workflows/`), or say in `docs/ADDING-A-SKILL.md` why it cannot run there. Found by the
  `agent-friendly-audit` cold run.
- **P1.3 version-bump check** (`done`, fourth batch). Nothing checks that a change to a plugin's files bumps that plugin's version
  and the bundle's, though CLAUDE.md requires it. A test or script that compares against the merge base and names the
  plugin to bump. Found by the same cold run; the owner decides whether it is worth its code.
  The fourth batch's plan check found one miss in eleven pull requests, and the owner chose a checklist line over a
  script: `docs/ADDING-A-SKILL.md` step 8 now gives a command that lists the plugins to bump. Build the script after a
  second miss.
- **P1.5 bug-fix trigger** (`done` in P0.5). After P0.5, "total() returns None when the cart is empty. Fix it." started
  no skill in 3 of 3 headless runs; the session fixed the bug inline, test first. The owner decided that is right: an
  obvious one-line fix needs no skill. The description now says when `bug-fix` is worth loading (the cause is not
  obvious, a first fix did not hold, the bug came back, the fix is risky).
- **P1.6 retrospective audit blind spots** (`done`, fifth batch). `audit.mjs` (and its copy in `session-close`) skips units of 12
  or fewer content words, so short CLAUDE.md bullets never score as DUPLICATE, and it does not scan skills synced from
  claude.ai under `~/.claude/skills/synced/<id>/<name>/`. The skill now tells the agent to read short bullets itself;
  the script should see both. Found by the fourth batch's review and cold run.
- **P1.7 mutate.sh and Python bytecode** (`done`, fifth batch). A break and its restore in the same second can leave a stale
  `.pyc`, so the mutant keeps running and a later control fails with no visible diff. Export
  `PYTHONDONTWRITEBYTECODE=1` in the harness or say so in `mutation-test`. Found by the M9 dry run.
- **P1.8 evaluator evidence line** (`done`, fifth batch). The evaluator's "Counts as evidence" line accepts "a passing automated test
  that you have run and watched pass", which an agent reads as enough without the mutation check the same skill
  requires; and its Mutation field accepts an unrun "would" claim. Found by the M8 cold run; pre-existing.
- **P1.4 typed-skill names** (`closed`: P0.5 removed every `/<plugin>:<name>` mention, so there is nothing left to
  ratchet). Some skills named a typed skill as `/<name>` without the `/<plugin>:<name>` form; the cold run of the
  second batch found three live instances, for example in `architect` and `which-skill`.
