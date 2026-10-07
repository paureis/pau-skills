---
name: dependency-upgrade
description: Plan and carry out dependency upgrades safely in any ecosystem (npm, pnpm, Yarn, Bun, pip, uv, Poetry, Go modules, Cargo, Maven, Gradle, Bundler, Composer, NuGet, Mix, Swift PM), including runtime and toolchain versions and Docker base images. Covers one major upgrade of a key framework or a batch pass of minor and patch updates, from inventory and a green baseline through changelog research, a bisectable plan, one commit per step, and a report of what was upgraded, skipped or blocked. Use when the user says "upgrade dependencies", "bump packages", "update deps", "upgrade to React 19", "move to Django 5", "upgrade Spring Boot", "bump the Go version", "update the Node version", "update the base image", "we are way behind on versions", "Dependabot has 30 PRs open", or "what breaks if we upgrade X".
argument-hint: "[package and target version, e.g. 'next 15', or 'hygiene' for a minor/patch pass]"
---

# Dependency upgrade

Upgrade dependencies so that every step can be judged, bisected and rolled back. The method is the same in every
ecosystem; only the commands change, and those are in the reference files.

Request from the user: $ARGUMENTS

Reference files, read when you reach their phase:
- `${CLAUDE_PLUGIN_ROOT}/skills/dependency-upgrade/ECOSYSTEMS.md`: per-ecosystem commands (list outdated, upgrade one
  package, move to a new major, regenerate the lockfile, audit, explain why a package is present, where changelogs
  live), plus runtimes, toolchains and Docker images.
- `${CLAUDE_PLUGIN_ROOT}/skills/dependency-upgrade/RESEARCH.md`: the checklist for researching one major bump.

## Pick the mode

- **Major mode**: one key package or framework moves across a major version (or a runtime moves to a new major).
  Phases 1 to 7 in full, with phase 3 done carefully for that package and for everything it drags along.
- **Hygiene mode**: a batch of minor and patch updates. Phase 3 is light (skim release notes for anything marked
  breaking or deprecated, because semver is a promise, not a guarantee). Any major that shows up in the inventory is
  listed and deferred to its own major-mode run unless the user asks for it.

If the request is ambiguous ("update everything"), run phase 1, show the inventory split into majors and minor/patch,
and ask which mode before changing anything.

## Rules

- **Never upgrade on a red baseline.** If tests, build, lint or type check fail before you change anything, you cannot
  tell which failures the upgrade caused. Stop and report.
- **One major per commit.** Several majors in one commit cannot be bisected and cannot be partly reverted. Minor and
  patch updates may be grouped.
- **Never edit a lockfile by hand.** Change the manifest, then let the package manager write the lockfile.
- **Never delete and regenerate a lockfile wholesale without the user's approval.** It silently re-resolves every
  transitive dependency to the newest allowed version, which is a hundred unreviewed upgrades hiding inside one.
  Use the targeted update commands in `ECOSYSTEMS.md` instead.
- **Never pin to a version you have not checked exists.** Query the registry for it (commands in `ECOSYSTEMS.md`)
  before writing it into a manifest. Version numbers remembered from training data are often wrong or not yet
  released, and a typo can resolve to a different package.
- **Flag supply-chain risk, do not wave it through.** A package that changed owner or maintainers, a sudden major
  after long dormancy, a new install script, or a name one letter off from a popular one: stop and tell the user before
  installing it. For a deeper JavaScript audit, use the `guards` plugin's `dependency-security-audit` skill.
- **Do not suppress warnings or skip tests to get green.** A test you disable to finish the upgrade is a breaking
  change you shipped without reading.
- **Respect what the project already uses**: its package manager (the lockfile says which), its update bot config
  (Renovate, Dependabot), its version-range style, its commit conventions.

## Phase 1: Inventory

1. Detect every ecosystem and lockfile in the repository, including nested ones in a monorepo (`git ls-files` and
   look for the manifest and lockfile names listed at the top of `ECOSYSTEMS.md`). Note runtime pins (`.nvmrc`,
   `.python-version`, `go.mod`'s `go` line, `rust-toolchain.toml`, `global.json`, `.tool-versions`) and every
   Dockerfile `FROM` and CI runtime matrix.
2. For each ecosystem, run its native outdated command and record current, wanted (newest within the declared range)
   and latest.
3. Mark each entry direct or transitive, and for transitive ones note which direct dependency pulls it in.
4. Note what pins or caps a package (a range in a manifest, an override or resolution, a peer requirement of another
   package). These are the likely blockers.

Done when you have one table per ecosystem: package, direct or transitive, current, wanted, latest, bump size
(patch, minor, major), and any known pin.

## Phase 2: Baseline

Run the project's own checks, found from its scripts, Makefile, task runner and CI workflow, not guessed:

- [ ] Install from the lockfile cleanly (the frozen or CI install command for the ecosystem)
- [ ] Build
- [ ] Tests (the full suite, the way CI runs it)
- [ ] Lint
- [ ] Type check, if the language has one separate from the build
- [ ] Record the wall-clock time of each, and count of existing warnings (deprecations especially)

If anything fails, stop. Report the failure and do not start upgrading. If the user wants to proceed anyway, record
the exact failing tests so that phase 5 compares against that list, and say in the report that the baseline was red.

Done when all checks pass and their timings and warning counts are written down.

## Phase 3: Research each major bump

For every major in scope, follow `RESEARCH.md`. In short:

1. Read the release notes, CHANGELOG and migration guide from the primary source (the project's repository releases,
   its CHANGELOG file, its official docs). Read every intermediate major, not only the target: going from 3 to 5
   means reading the 4.0 notes too.
2. List each breaking change and grep the codebase for the affected APIs, options and config keys. A breaking change
   with zero hits is noted and dismissed; one with hits becomes a task.
3. Check the new version's runtime requirement (minimum Node, Python, Go, JDK, Rust) and its peer dependencies. These
   often force another upgrade first.
4. Check for an official codemod or migration tool and how it is run.
5. Check supply-chain signals: publisher, maintainers, release date, and whether the release is final (not an alpha,
   beta or release candidate unless the user asked for one).

Done when every major has a short research note: source links, breaking changes that hit this code (with file
counts), required runtime and peers, codemod, and risk flags.

## Phase 4: Plan

Order the steps so each depends only on steps before it:

1. Toolchain and runtime first (language version, build tool such as the Gradle or Maven wrapper), because frameworks
   state a minimum runtime.
2. Frameworks next, one major at a time. If a framework must cross two majors, plan two steps when an intermediate
   release exists that runs on both.
3. Libraries that depend on the framework (plugins, adapters, type packages) with or right after it.
4. Independent libraries last.
5. Minor and patch updates grouped by ecosystem or by area, in a separate step from any major.

Each step must be small enough to bisect, must leave the baseline green when it is done, and is its own commit, so
the commit before it is the rollback point. Write the plan as a numbered list: step, packages and versions (from and
to), codemod if any, expected code changes, and anything that needs the user's decision.

Show the plan to the user before executing it when it contains a major, a lockfile regeneration, a runtime change or
anything flagged in phase 3. A hygiene pass with no flags may go ahead.

Done when the plan is written and, where needed, approved.

## Phase 5: Execute, one step at a time

For each step in the plan:

- [ ] Change the manifest or run the package manager's targeted upgrade command for exactly the packages in the step
- [ ] Let the package manager regenerate the lockfile; check the lockfile diff touches what you expected and not
      dozens of unrelated packages (if it does, find out why before continuing)
- [ ] Run the codemod, if there is one, then read its diff; codemods miss cases and sometimes rewrite wrongly
- [ ] Fix the remaining breakages found in phase 3 and by the compiler and tests
- [ ] Run the full baseline from phase 2, not a subset
- [ ] Commit the step alone, with a message that names each package and its versions, for example
      `chore(deps): upgrade django 4.2.16 -> 5.1.3` or `chore(deps): patch and minor updates (12 packages)` with the
      list in the body

If a step cannot be made green within reasonable effort, revert it to the previous commit, mark the package blocked
with the reason, and continue with steps that do not depend on it. Do not stack further upgrades on a broken step.

Done when every step is committed green or recorded as skipped or blocked.

## Phase 6: Verify beyond the tests

Tests rarely cover everything an upgrade can change.

- [ ] Compare warnings with the baseline: new deprecation warnings from build, tests and runtime point at the next
      breaking change. Fix cheap ones now, list the rest.
- [ ] Bundle or binary size, if the project ships one (a large jump often means a duplicated dependency or a changed
      default).
- [ ] Duplicate versions of the same package in the tree (the "why" commands in `ECOSYSTEMS.md`).
- [ ] Smoke run the real application: start it, exercise a main path, watch the logs. For a library, build it and
      import it from a scratch consumer.
- [ ] Run the ecosystem's vulnerability audit and compare with before.
- [ ] Check the runtime pins agree everywhere: version files, CI matrix, Dockerfile, deployment config.
- [ ] Compare test and build timings with the baseline; a large slowdown is worth reporting.

Done when each item is checked or marked not applicable with a reason.

## Phase 7: Report

Produce this report, in this order:

```
## Dependency upgrade report

Mode: major (<package> <from> -> <to>) | hygiene
Baseline: green | red (<what failed>), timings <build / tests / lint>

| Package | Ecosystem | From | To | Status | Notes |
|---------|-----------|------|----|--------|-------|
| ...     | ...       | ...  | ...| upgraded / skipped / blocked | breaking changes fixed, codemod used, or the reason |

Commits: <hash> <message>, one per step, in order (each is a rollback point)
Code changes: <files touched outside manifests and lockfiles, and why>
Warnings: <new deprecations, before vs after count>
Verification: <smoke run result, size change, audit before vs after, timing change>
Supply-chain flags: <packages flagged and why, or none>
Deferred: <majors left for a separate run, with the main blocker for each>
Needs your decision: <anything you did not do without approval>
```

"Skipped" means you chose not to do it (out of scope, deferred major). "Blocked" means you tried or researched it and
something prevents it: name the blocker (peer requirement, runtime, an unfixed upstream bug with its issue link).

## When not to use this

- The task is a security response to a specific CVE: use `dependency-security-audit` first, then come back here for
  the upgrade itself if it is a major.
- There is no test suite or build at all: say so. Without a baseline the upgrade cannot be judged, and the honest
  first step is a smoke test the user agrees covers the main paths.
