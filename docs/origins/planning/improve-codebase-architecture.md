# improve-codebase-architecture (Adapted from [`improve-codebase-architecture`](https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture) and pstack [`design-red-flags.md`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/architect/references/design-red-flags.md), `architect/SKILL.md`, `principle-minimize-reader-load`, `principle-model-the-domain` and `poteto-mode/playbooks/refactoring.md`)

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `SKILL.md` 2026-04-28 to 2026-05-27; `LANGUAGE.md` and `INTERFACE-DESIGN.md` 2026-04-24 to
2026-06-10. `LANGUAGE.md` is essentially upstream's (97% of its 6-grams), trimmed.

**Later changes (2026-10-18, from pstack at 09d06eb).** 85 of 1,464 new word 6-grams (5.8%) appear in pstack: 23 in
`architect/SKILL.md` (the agent-contributor sentence), 22 in `design-red-flags.md` (the flag names and two
definitions), 18 in `principle-minimize-reader-load` (the 30-second test), 15 in `principle-model-the-domain` (the
boolean sign and "do not force an abstraction"), 8 in `refactoring.md` ("type check and lint are not a pin"). The new
`SKILL.md` lines share 11.4%, `EXECUTION.md` 1.0%. What this version changes against those files:
- Seven of upstream's eight red flags, as one-line bullets in this skill's vocabulary, used in Explore to find
  candidates rather than to screen sketches (shallow module was already in the friction questions).
- The reader-load test, scored as a net change; upstream's six bullets are dropped.
- From model-the-domain, only the signs and the "boring code" line; each candidate names what it removes.
- A step 4, Execution (`EXECUTION.md`), only on an explicit ask to implement and a yes to the decisions left open, on
  a clean tree and its own branch: a characterization pin at the nearest interface the change leaves in place,
  committed and proven able to fail (with `tdd` or `mutation-test` if installed, by hand otherwise), small green
  steps, callers migrated and the old path deleted in one wave within the change, with stored names, queued jobs,
  rolling deploys and outside callers left to the user, and before and after reader-load counts. Upstream's
  subagent delegation, separate target-shape and subtract steps and rebase and pull request step are dropped.

**What this version changes.**
- Self-contained: links to files that are not part of it are removed (`DEEPENING.md`, and `CONTEXT-FORMAT.md` and
  `ADR-FORMAT.md` in another skill).
- It no longer requires the Explore subagent.
- `CONTEXT.md` and `docs/adr/` are used if they exist.
- `INTERFACE-DESIGN.md` generates three or more designs inline under named constraints (minimize the interface,
  maximize flexibility, optimize the common caller, ports and adapters), instead of spawning parallel subagents.
- Each key principle gets a one-line explanation.
- A Rules section: no code before step 4 (no code at all before 2026-10-18), domain language first, respect ADRs, be
  opinionated.
- Broader trigger phrases.

**Why.** I run it in sessions and tools where subagents and the sibling skills are not available.
