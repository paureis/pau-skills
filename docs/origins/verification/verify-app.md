# verify-app and `check-map.mjs` (Adapted from [pstack `create-verification-skill`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/create-verification-skill))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/create-verification-skill/SKILL.md` and its `references/feature-map-example/`,
`skills/maintain-verification-skill/SKILL.md`, and `docs/guide/06-verify-and-ship.md`. Shared word 6-grams, measured
before the review round (which only lowered them): `SKILL.md` about 6%, `MAINTAIN.md` about 9%, the templates about
2%, the example map 0 to 1%; `DRIVING.md` and `check-map.mjs` none. The shared part is mostly structure: the
interview questions, the Launch, Doctor, Drive, Evidence and Cleanup sections, the four upstream feature headings
(Sub-features, How to get to it, Driving it, Gotchas), the end-to-end proof, and maintain's outcomes and rules.

**Problem.** An agent says a change works without having used the running app, because the project has no written way
to start it, drive it and keep proof.

**What this version changes.**
- Two upstream skills become one: maintain is the `maintain` argument, with its steps in `MAINTAIN.md`. An existing
  verify skill is used instead of writing a second.
- Written for Claude Code: output goes to `.claude/skills/verify-<app>/`; questions through AskUserQuestion one at a
  time; the Agent tool for the per-feature source check and for a cold-reader proof, or a fresh session.
- Run state is explicit: one exported env file per run; every place the app writes (current folder, home, XDG
  folders, temp, configured paths) pointed into the run folder, with a git status check that nothing escaped into the
  repository; one record of what the run started, with a start-time check before any process is stopped; tmux on a
  private socket; scratch files named with the run ID and deleted only by recorded path; the run folder removed only
  after the stop is confirmed.
- The run folder stays outside the repository on purpose, so an app that searches upward does not find the
  repository's own files; a refused write there ends the pass as blocked, never with the run moved inside. Maintain
  mode keeps its notes and helper scripts in a git-ignored `.verify-app-notes/` folder inside the project, removed at
  the end of the pass that made it.
- Templates with every spot to fill marked, server and CLI variants of Launch and Doctor, numbered evidence per step,
  and an explained "not yet proven on the real target" section.
- New `DRIVING.md`: the project's own harness first, with signals per ecosystem, then fallbacks for web, CLI, TUI,
  HTTP, mobile, desktop and libraries, and port-owner commands per OS.
- New `check-map.mjs`, a checker for the generated skill: frontmatter, required sections with a command in Launch,
  Doctor and Cleanup, leftover template tokens, the index against the feature files (subfolders and the common link
  forms), the five feature headings (the upstream four plus States, added in Q7), and an evidence folder that git
  ignores and does not track. Markdown is read the CommonMark way where it matters.
- States and skeletons (Q7, Original, from Aiden Bai's post on X of 2026-10-18 on measuring the loaded UI with
  Playwright to match a skeleton, and the "empty, loading and error states on every screen" line of the
  production-readiness list behind Q6): each feature file gains a fifth heading, States (how to force loading, empty
  and error, with a screenshot each, or one line for a feature with no screen), which `check-map.mjs` requires and,
  for older maps, says maintain mode adds. The generated skill gains a States and skeletons recipe with a copied
  in-page helper, `measure-boxes.js`, that pairs skeleton and real boxes by marker or document order, reports boxes
  off by more than 4 px and a layout-shift score above 0.1 (Chromium only, skipped elsewhere), fails when nothing
  matched, and resizes a skeleton only on a yes before measuring again. Maintain mode reports a skeleton mismatch as
  a product gap.
- The example map is rewritten (invoices, driven through a browser, an API and a CLI).
- Removed: Cursor paths and commands, and the guide's pull request, shipping and benchmark material.

**Why.** Proving behaviour in the real app is the step agents skip most, and pstack's pair of skills is the clearest
method I found for making it repeatable. A dry run on a fixture service and a cold run by a fresh agent on a fixture
CLI (`tests/fixtures/verify-app/`) found the export and current-folder problems that the review round fixed.
