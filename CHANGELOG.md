# Changelog

Versions are per plugin and live in `.claude-plugin/marketplace.json`. A change reaches users only when the version of
the plugin they installed is bumped.

## 2026-11-16: Q23, the lazy senior developer, adapted from ponytail

- `lazy-senior` (planning 0.9.0), a new skill adapted from DietrichGebert/ponytail (MIT): it writes the smallest
  complete change (does it need to exist, then the codebase, the standard library, an installed dependency), never
  cuts validation, error handling, security, accessibility or a needed test, reviews a change or a repository with
  bugs first and bloat last, and lists `shortcut:` comments with `debt.mjs`. Fresh, safe examples in five languages.
- The `lazy-senior` hook (planning, `pau-skills-hooks` 0.5.0) adds the skill's short ruleset to every session and
  every subagent, on by default; installing the `planning` plugin now turns it on too. Off with
  `"hooks": {"lazy-senior": false}` or `PAU_SKILLS_DISABLE=lazy-senior`. A blind skill-eval run (Haiku, three tasks)
  found the ruleset no worse and smaller on the bug fix.
- The same rules everywhere: geppetto roster 5 (agent-orchestration 0.11.4), where `builder` works by the smallest
  complete change and `reviewer` ends with a bigger-than-needed check that needs a concrete case; `review-triage`
  (verification 0.14.3) and lean-subagent-dev's copy treat a needless addition with its case as fix if cheap and a
  `shortcut:` comment as a decision, never for a guard or a security finding; `engineering-principles` says use what
  already exists inside "Subtract before you add"; `which-skill` (session-discipline 0.13.2) routes to the new skill.
  New tests: installed agents match their roster files byte for byte, the principles' line counts match their files,
  and the shared rules agree across the skill, the agents and the triage method.
- The bundle goes to 0.19.0. The entry of 2026-11-11 moved to `docs/changelog/2026-W46.md`, since week 46 had ended.

## Older entries

Each earlier ISO week is in its own file in docs/changelog/, named `<year>-W<week>.md`; a week too large for one file
goes on in `<year>-W<week>-2.md`.

- [2026-W46: 2026-11-09 to 2026-11-15](docs/changelog/2026-W46.md)
- [2026-W45: 2026-11-02 to 2026-11-08](docs/changelog/2026-W45.md)
- [2026-W44: 2026-10-26 to 2026-11-01](docs/changelog/2026-W44.md)
- [2026-W43, second part: 2026-10-23 to 2026-10-25](docs/changelog/2026-W43-2.md)
- [2026-W43: 2026-10-19 to 2026-10-22](docs/changelog/2026-W43.md)
- [2026-W42: 2026-10-12 to 2026-10-18](docs/changelog/2026-W42.md)
- [2026-W41: 2026-10-05 to 2026-10-11](docs/changelog/2026-W41.md)
- [2026-W40: 2026-09-28 to 2026-10-04](docs/changelog/2026-W40.md)
